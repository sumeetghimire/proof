/**
 * Detects hallucinated (non-existent) API calls in PR diff.
 * Parses added JavaScript/Node code and checks calls against installed modules.
 */

const acorn = require('acorn');
const { runCommand } = require('./exec.js');

const JS_EXT = /\.(c?js|m?jsx?|tsx?)$/i;

/**
 * Parses a unified diff and returns per-file added line ranges.
 * @param {string} diff - Raw diff (e.g. from GitHub API)
 * @returns {Array<{ file: string, lines: string[] }>}
 */
function parseDiffFiles(diff) {
  const blocks = [];
  let currentFile = null;
  let currentLines = [];
  for (const line of diff.split('\n')) {
    const gitFile = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    const plusFile = line.match(/^\+\+\+ b\/(.+)$/);
    if (gitFile) {
      if (currentFile) blocks.push({ file: currentFile, lines: currentLines });
      currentFile = gitFile[2];
      currentLines = [];
    } else if (plusFile) {
      currentFile = plusFile[1];
    } else if (line.startsWith('+') && !line.startsWith('+++')) {
      const code = line.slice(1).replace(/^\s*/, '');
      if (code && currentFile) currentLines.push(code);
    }
  }
  if (currentFile) blocks.push({ file: currentFile, lines: currentLines });
  return blocks.filter((b) => b.lines.length > 0 && JS_EXT.test(b.file));
}

/**
 * Recursively walks an acorn AST and invokes callback for each CallExpression.
 * @param {object} node - Acorn AST node
 * @param {(node: object) => void} cb
 */
function walkCallExpressions(node, cb) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression') cb(node);
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((n) => walkCallExpressions(n, cb));
    else walkCallExpressions(v, cb);
  }
}

/**
 * Resolves object and method name from a call expression callee.
 * @param {object} callee - AST node (Identifier or MemberExpression)
 * @returns {{ object: string | null, method: string }}
 */
function getCalleeNames(callee) {
  if (callee.type === 'Identifier') {
    return { object: null, method: callee.name };
  }
  if (callee.type === 'MemberExpression') {
    const prop = callee.property.type === 'Identifier' ? callee.property.name : null;
    if (!prop) return { object: null, method: 'unknown' };
    const obj = getObjectName(callee.object);
    return { object: obj, method: prop };
  }
  return { object: null, method: 'unknown' };
}

function getObjectName(node) {
  if (node.type === 'Identifier') return node.name;
  if (node.type === 'MemberExpression') {
    const left = getObjectName(node.object);
    const right = node.property.type === 'Identifier' ? node.property.name : '';
    return left ? `${left}.${right}` : right;
  }
  return null;
}

/**
 * Extracts API calls (function/method invocations) from added lines in a diff.
 * @param {string} diff - Raw PR diff
 * @returns {Array<{ object: string | null, method: string, file: string, line: number }>}
 */
function extractAPICalls(diff) {
  const out = [];
  const blocks = parseDiffFiles(diff);
  for (const { file, lines } of blocks) {
    const code = lines.join('\n');
    if (!code.trim()) continue;
    let ast;
    try {
      ast = acorn.parse(code, { ecmaVersion: 2022, locations: true });
    } catch {
      continue;
    }
    walkCallExpressions(ast, (node) => {
      const { object, method } = getCalleeNames(node.callee);
      const line = node.loc ? node.loc.start.line : 0;
      out.push({ object, method, file, line });
    });
  }
  return out;
}

/**
 * Validates API calls in the workspace (Node: require(module) and check method exists).
 * @param {Array<{ object: string | null, method: string, file: string, line: number }>} apiCalls
 * @param {{ language: string }} language
 * @param {string} workspace - Absolute path to repo
 * @returns {Promise<Array<{ call: string, file: string, line: number, reason: string }>>}
 */
async function validateAPICalls(apiCalls, language, workspace) {
  if (language.language !== 'node' || !apiCalls.length) return [];
  const seen = new Set();
  const toCheck = [];
  for (const c of apiCalls) {
    if (c.object == null) continue;
    const key = `${c.object}:${c.method}`;
    if (seen.has(key)) continue;
    seen.add(key);
    toCheck.push(c);
  }
  const failedKeys = new Set();
  const reasonByKey = new Map();
  for (const c of toCheck) {
    const mod = c.object;
    const esc = (s) => s.replace(/'/g, "'\"'\"'");
    const script = `try { const m = require('${esc(mod)}'); const t = typeof m.${c.method}; console.log(t); } catch (e) { console.log("missing"); }`;
    const result = await runCommand(workspace, `node -e "${script.replace(/"/g, '\\"')}"`);
    const out = (result.stdout + result.stderr).trim();
    if (out !== 'function' && out !== 'object') {
      const key = `${mod}:${c.method}`;
      failedKeys.add(key);
      reasonByKey.set(key, out === 'missing' ? 'module or method not found' : `typeof is ${out}, not function`);
    }
  }
  const hallucinated = [];
  for (const c of apiCalls) {
    if (c.object == null) continue;
    const key = `${c.object}:${c.method}`;
    if (failedKeys.has(key)) {
      hallucinated.push({
        call: `${c.object}.${c.method}()`,
        file: c.file,
        line: c.line,
        reason: reasonByKey.get(key),
      });
    }
  }
  return hallucinated;
}

/**
 * Detects hallucinated API calls in the diff using the workspace (Node require check).
 * @param {string} diff - Raw PR diff
 * @param {{ language: string }} language
 * @param {string} workspace - Absolute path to repo
 * @returns {Promise<{ hallucinations: Array<{ call: string, file: string, line: number, reason: string }>, count: number }>}
 */
async function detectHallucinations(diff, language, workspace) {
  const apiCalls = extractAPICalls(diff);
  const hallucinations = await validateAPICalls(apiCalls, language, workspace);
  return { hallucinations, count: hallucinations.length };
}

module.exports = {
  extractAPICalls,
  validateAPICalls,
  detectHallucinations,
  parseDiffFiles,
};
