/**
 * Sensitive file check: warn when critical/high/medium sensitivity files are modified,
 * and when critical sensitive files (e.g. .env) exist in the repo even if not in this PR.
 */

const path = require('path');
const fs = require('fs').promises;
const { getChangedFilesFromDiff } = require('./issue.js');

const CRITICAL_PATTERNS = [
  { re: /^\.github\/workflows\/.+\.(yml|yaml)$/i, reason: 'CI/CD pipeline' },
  { re: /^Dockerfile$/i, reason: 'Container environment' },
  { re: /^docker-compose\.(yml|yaml)$/i, reason: 'Container environment' },
  { re: /(^|\/)\.env(\.|$)/i, reason: 'Environment configuration' },
  { re: /\/secrets\/|\/secret\//i, reason: 'Secrets directory' },
];
const HIGH_PATTERNS = [
  { re: /^package\.json$/i, reason: 'Dependency manifest' },
  { re: /^requirements\.txt$/i, reason: 'Python dependencies' },
  { re: /^composer\.json$/i, reason: 'PHP dependencies' },
  { re: /^go\.mod$/i, reason: 'Go modules' },
  { re: /^Makefile$/i, reason: 'Build script' },
  { re: /deploy\.sh$/i, reason: 'Deployment script' },
  { re: /\/deploy\//i, reason: 'Deploy directory' },
  { re: /(nginx|apache)\.conf$/i, reason: 'Server config' },
  { re: /\.(pem|key|cert|crt)$/i, reason: 'Certificate/key file' },
];
const MEDIUM_PATTERNS = [
  { re: /^SECURITY\.md$/i, reason: 'Security policy' },
  { re: /^\.gitignore$/i, reason: 'Ignore rules' },
  { re: /\/config\/.+/i, reason: 'Config directory' },
];

/** Paths to check for presence in repo (critical only). */
const CRITICAL_PATHS_TO_CHECK = [
  { path: '.env', reason: 'Environment configuration' },
  { path: '.env.local', reason: 'Environment configuration' },
  { path: '.env.development', reason: 'Environment configuration' },
  { path: '.env.production', reason: 'Environment configuration' },
  { path: 'Dockerfile', reason: 'Container environment' },
  { path: 'docker-compose.yml', reason: 'Container environment' },
];

/**
 * Returns list of critical sensitive files that exist in the workspace (even if not in this PR's diff).
 * @param {string} workspace - Repo root path (e.g. GITHUB_WORKSPACE)
 * @returns {Promise<{ path: string, reason: string }[]>}
 */
async function getExistingSensitiveFiles(workspace) {
  const found = [];
  for (const { path: relPath, reason } of CRITICAL_PATHS_TO_CHECK) {
    try {
      await fs.access(path.join(workspace, relPath));
      found.push({ path: relPath, reason });
    } catch {
      /**/
    }
  }
  return found;
}

/**
 * Classifies changed files by sensitivity and lists critical files present in repo.
 * @param {string} diff - PR unified diff
 * @param {string} [workspace] - Repo root; if provided, also reports existing critical sensitive files
 * @returns {Promise<{ critical: { path: string, reason: string }[], high: { path: string, reason: string }[], medium: { path: string, reason: string }[], presentInRepo: { path: string, reason: string }[] }>}
 */
async function checkSensitiveFiles(diff, workspace) {
  const files = getChangedFilesFromDiff(diff);
  const critical = [];
  const high = [];
  const medium = [];
  const match = (path, list) => {
    for (const { re, reason } of list) {
      if (re.test(path)) return reason;
    }
    return null;
  };
  for (const rawPath of files) {
    const path = (rawPath && rawPath.trim()) || '';
    if (!path) continue;
    const c = match(path, CRITICAL_PATTERNS);
    if (c) {
      critical.push({ path, reason: c });
      continue;
    }
    const h = match(path, HIGH_PATTERNS);
    if (h) {
      high.push({ path, reason: h });
      continue;
    }
    const m = match(path, MEDIUM_PATTERNS);
    if (m) medium.push({ path, reason: m });
  }
  let presentInRepo = [];
  if (workspace) {
    presentInRepo = await getExistingSensitiveFiles(workspace);
  }
  return { critical, high, medium, presentInRepo };
}

module.exports = {
  checkSensitiveFiles,
  getExistingSensitiveFiles,
};
