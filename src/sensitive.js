/**
 * Sensitive file check: warn when critical/high/medium sensitivity files are modified.
 */

const { getChangedFilesFromDiff } = require('./issue.js');

const CRITICAL_PATTERNS = [
  { re: /^\.github\/workflows\/.+\.(yml|yaml)$/i, reason: 'CI/CD pipeline' },
  { re: /^Dockerfile$/i, reason: 'Container environment' },
  { re: /^docker-compose\.(yml|yaml)$/i, reason: 'Container environment' },
  { re: /^\.env(\.|$)/i, reason: 'Environment configuration' },
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
  { re: /^README\.md$/i, reason: 'Documentation' },
  { re: /^SECURITY\.md$/i, reason: 'Security policy' },
  { re: /^\.gitignore$/i, reason: 'Ignore rules' },
  { re: /\/config\/.+/i, reason: 'Config directory' },
];

/**
 * Classifies changed files by sensitivity. Does not block merge; for reporting only.
 * @param {string} diff - PR unified diff
 * @returns {{ critical: { path: string, reason: string }[], high: { path: string, reason: string }[], medium: { path: string, reason: string }[] }}
 */
function checkSensitiveFiles(diff) {
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
  for (const path of files) {
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
  return { critical, high, medium };
}

module.exports = {
  checkSensitiveFiles,
};
