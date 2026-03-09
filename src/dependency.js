/**
 * Dependency risk check: typosquatting, package age, download count.
 * Reads diff for new deps in package.json, requirements.txt, composer.json.
 */

const POPULAR =
  'express,react,lodash,axios,moment,webpack,babel,typescript,eslint,prettier,jest,mocha,next,vue,angular,fastapi,flask,django,requests,numpy,pandas'.split(',');

/**
 * Levenshtein distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
function levenshtein(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array(m + 1)
    .fill(0)
    .map(() => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) d[i][0] = i;
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      d[i][j] = Math.min(
        d[i - 1][j] + 1,
        d[i][j - 1] + 1,
        d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return d[m][n];
}

/**
 * Parses diff for dependency file blocks (package.json, requirements.txt, composer.json).
 * @param {string} diff
 * @returns {Array<{ file: string, lines: string[] }>}
 */
function parseDiffForDependencyFiles(diff) {
  const blocks = [];
  let currentFile = null;
  let currentLines = [];
  const depFiles = /(package\.json|requirements\.txt|composer\.json)$/i;
  for (const line of diff.split('\n')) {
    const gitFile = line.match(/^diff --git a\/.+? b\/(.+)$/);
    const plusFile = line.match(/^\+\+\+ b\/(.+)$/);
    if (gitFile) {
      if (currentFile && depFiles.test(currentFile)) blocks.push({ file: currentFile, lines: currentLines });
      currentFile = gitFile[1];
      currentLines = [];
    } else if (plusFile) currentFile = plusFile[1];
    else if (line.startsWith('+') && !line.startsWith('+++') && currentFile) {
      const code = line.slice(1).trim();
      if (code) currentLines.push(code);
    }
  }
  if (currentFile && depFiles.test(currentFile)) blocks.push({ file: currentFile, lines: currentLines });
  return blocks;
}

/**
 * Extracts new dependency names from added lines.
 * @param {Array<{ file: string, lines: string[] }>} blocks
 * @returns {Array<{ name: string, file: string }>}
 */
function extractNewDeps(blocks) {
  const deps = [];
  for (const { file, lines } of blocks) {
    for (const line of lines) {
      if (file.endsWith('package.json')) {
        const m = line.match(/^\s*"([^"/@][^"]*)"\s*:\s*["\d.]/);
        if (m && !line.includes('"scripts"')) deps.push({ name: m[1], file });
      } else if (file.endsWith('requirements.txt')) {
        const name = line.split(/[=<>!]/)[0].trim().toLowerCase();
        if (name && !name.startsWith('#')) deps.push({ name, file });
      } else if (file.endsWith('composer.json')) {
        const m = line.match(/^\s*"([^"]+\/[^"]+)"\s*:/);
        if (m) deps.push({ name: m[1], file });
      }
    }
  }
  return deps;
}

/**
 * Checks if package name is possible typosquat (distance 1–2 from popular).
 * @param {string} name - Package name (scoped name uses last segment for npm)
 * @returns {{ suggested: string, distance: number } | null}
 */
function checkTyposquat(name) {
  const base = name.includes('/') ? name.split('/').pop() : name;
  const lower = base.toLowerCase();
  for (const p of POPULAR) {
    const d = levenshtein(lower, p);
    if (d >= 1 && d <= 2) return { suggested: p, distance: d };
  }
  return null;
}

/**
 * Fetches npm package metadata (time, weekly downloads).
 * @param {string} name
 * @returns {Promise<{ time: string | null, downloads: number } | null>}
 */
async function fetchNpmInfo(name) {
  try {
    const res = await fetch(`https://registry.npmjs.org/${encodeURIComponent(name)}`);
    if (!res.ok) return null;
    const data = await res.json();
    const time = data.time && (data.time.created || data.time.modified);
    const downloads = (data.downloads && data.downloads.week) || 0;
    return { time: time || null, downloads };
  } catch {
    return null;
  }
}

/**
 * Fetches PyPI package release date.
 * @param {string} name
 * @returns {Promise<{ time: string | null } | null>}
 */
async function fetchPyPIInfo(name) {
  try {
    const res = await fetch(`https://pypi.org/pypi/${encodeURIComponent(name)}/json`);
    if (!res.ok) return null;
    const data = await res.json();
    const urls = data.releases && Object.keys(data.releases).length ? data.releases[Object.keys(data.releases).pop()] : [];
    const upload = urls.length && urls[0].upload_time ? urls[0].upload_time : null;
    return { time: upload };
  } catch {
    return null;
  }
}

/**
 * Days since ISO date string.
 * @param {string} iso
 * @returns {number}
 */
function daysSince(iso) {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso)) / (24 * 60 * 60 * 1000));
}

/**
 * Runs dependency risk checks on new deps found in diff.
 * @param {string} diff - Raw PR diff
 * @returns {Promise<{ risks: Array<{ name: string, file: string, typo?: { suggested: string, distance: number }, age?: string, downloads?: number }>, hasTyposquat: boolean }>}
 */
async function checkDependencyRisks(diff) {
  const blocks = parseDiffForDependencyFiles(diff);
  const deps = extractNewDeps(blocks);
  const seen = new Set();
  const risks = [];
  let hasTyposquat = false;

  for (const { name, file } of deps) {
    const key = `${file}:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const risk = { name, file };

    const typo = checkTyposquat(name);
    if (typo) {
      risk.typo = { suggested: typo.suggested, distance: typo.distance };
      hasTyposquat = true;
    }

    const isNpm = file.endsWith('package.json');
    const isPy = file.endsWith('requirements.txt');
    if (isNpm) {
      const info = await fetchNpmInfo(name);
      if (info) {
        const days = daysSince(info.time);
        if (days < 30) risk.age = days < 7 ? `${days} days (very new)` : `${days} days`;
        if (info.downloads < 100) risk.downloads = info.downloads;
      }
    } else if (isPy) {
      const info = await fetchPyPIInfo(name);
      if (info && info.time) {
        const days = daysSince(info.time);
        if (days < 30) risk.age = days < 7 ? `${days} days (very new)` : `${days} days`;
      }
    }

    if (risk.typo || risk.age || risk.downloads !== undefined) risks.push(risk);
  }

  return { risks, hasTyposquat };
}

module.exports = {
  checkDependencyRisks,
  parseDiffForDependencyFiles,
  extractNewDeps,
  checkTyposquat,
};
