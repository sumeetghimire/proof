/**
 * Import/API validation: extract import/require from diff, validate modules and named exports.
 */

const acorn = require('acorn');
const fs = require('fs').promises;
const path = require('path');

const JS_EXT = /\.(c?js|m?jsx?|tsx?)$/i;

/**
 * Parses diff for JS file blocks (added lines).
 * @param {string} diff
 * @returns {Array<{ file: string, lines: string[] }>}
 */
function parseDiffJSBlocks(diff) {
  const blocks = [];
  let currentFile = null;
  let currentLines = [];
  for (const line of diff.split('\n')) {
    const gitFile = line.match(/^diff --git a\/.+? b\/(.+)$/);
    const plusFile = line.match(/^\+\+\+ b\/(.+)$/);
    if (gitFile) {
      if (currentFile && JS_EXT.test(currentFile)) blocks.push({ file: currentFile, lines: currentLines });
      currentFile = gitFile[1];
      currentLines = [];
    } else if (plusFile) currentFile = plusFile[1];
    else if (line.startsWith('+') && !line.startsWith('+++') && currentFile) {
      const code = line.slice(1).trim();
      if (code) currentLines.push(code);
    }
  }
  if (currentFile && JS_EXT.test(currentFile)) blocks.push({ file: currentFile, lines: currentLines });
  return blocks.filter((b) => b.lines.length > 0);
}

/**
 * Walks AST and collects import/require specs.
 * @param {object} node
 * @param {Array<{ module: string, export: string | null, file: string, line: number }>} out
 * @param {string} file
 */
function walkImports(node, out, file) {
  if (!node || typeof node !== 'object') return;
  const line = node.loc ? node.loc.start.line : 0;
  if (node.type === 'ImportDeclaration' && node.source && node.source.value) {
    const mod = node.source.value;
    if (node.specifiers) {
      for (const s of node.specifiers) {
        const exp = s.type === 'ImportDefaultSpecifier' ? 'default' : (s.imported && s.imported.name) || s.local.name;
        out.push({ module: mod, export: exp === 'default' ? null : exp, file, line });
      }
    }
  }
  if (node.type === 'CallExpression' && node.callee.name === 'require' && node.arguments[0]) {
    const arg = node.arguments[0];
    const mod = arg.type === 'Literal' ? arg.value : null;
    if (mod) out.push({ module: mod, export: null, file, line });
  }
  for (const key of Object.keys(node)) {
    const v = node[key];
    if (Array.isArray(v)) v.forEach((n) => walkImports(n, out, file));
    else walkImports(v, out, file);
  }
}

/**
 * Extracts all import/require from added JS in diff.
 * @param {string} diff
 * @returns {Array<{ module: string, export: string | null, file: string, line: number }>}
 */
function extractImportsFromDiff(diff) {
  const blocks = parseDiffJSBlocks(diff);
  const out = [];
  for (const { file, lines } of blocks) {
    const code = lines.join('\n');
    if (!code.trim()) continue;
    try {
      const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', locations: true });
      walkImports(ast, out, file);
    } catch {
      // try without module (require-only)
      try {
        const ast = acorn.parse(code, { ecmaVersion: 2022, locations: true });
        walkImports(ast, out, file);
      } catch {
        /**/
      }
    }
  }
  return out;
}

/**
 * Resolves package dir in workspace (node_modules).
 * @param {string} workspace
 * @param {string} moduleName
 * @returns {Promise<string | null>}
 */
async function resolvePackageDir(workspace, moduleName) {
  const nm = path.join(workspace, 'node_modules');
  if (moduleName.startsWith('@')) {
    const [scope, pkg] = moduleName.split('/');
    const dir = path.join(nm, scope, pkg || '');
    try {
      await fs.access(path.join(dir, 'package.json'));
      return dir;
    } catch {
      return null;
    }
  }
  const dir = path.join(nm, moduleName);
  try {
    await fs.access(path.join(dir, 'package.json'));
    return dir;
  } catch {
    return null;
  }
}

/**
 * Gets exported names from a package entry file (static analysis).
 * @param {string} entryPath
 * @returns {Promise<string[]>}
 */
async function getExportsFromEntry(entryPath) {
  const names = new Set();
  try {
    const code = await fs.readFile(entryPath, 'utf8');
    const ast = acorn.parse(code, { ecmaVersion: 2022, sourceType: 'module', locations: false });
    const visit = (n) => {
      if (!n) return;
      if (n.type === 'ExportNamedDeclaration' && n.declaration) {
        if (n.declaration.declarations) n.declaration.declarations.forEach((d) => d.id && names.add(d.id.name));
        if (n.declaration.id) names.add(n.declaration.id.name);
      }
      if (n.type === 'ExportSpecifier' && n.exported) names.add(n.exported.name);
      for (const k of Object.keys(n)) {
        const v = n[k];
        if (Array.isArray(v)) v.forEach(visit);
        else visit(v);
      }
    };
    visit(ast);
    if (code.includes('module.exports')) names.add('default');
  } catch {
    /**/
  }
  return [...names];
}

/**
 * Validates imports against workspace node_modules; returns hallucinated list.
 * @param {Array<{ module: string, export: string | null, file: string, line: number }>} imports
 * @param {string} workspace
 * @returns {Promise<Array<{ module: string, export: string | null, file: string, line: number, reason: string, available?: string[], suggested?: string }>>}
 */
async function validateImports(imports, workspace) {
  const hallucinated = [];
  for (const imp of imports) {
    const dir = await resolvePackageDir(workspace, imp.module);
    if (!dir) {
      hallucinated.push({ ...imp, reason: `module not found in node_modules` });
      continue;
    }
    if (imp.export == null) continue;
    const pkgPath = path.join(dir, 'package.json');
    let main = 'index.js';
    try {
      const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
      main = pkg.main || main;
    } catch {
      /**/
    }
    const entryPath = path.isAbsolute(main) ? main : path.join(dir, main);
    const exports = await getExportsFromEntry(entryPath);
    if (exports.length > 0 && !exports.includes(imp.export)) {
      const suggested = exports.filter((e) => e.toLowerCase().startsWith(imp.export.slice(0, 2))).slice(0, 3);
      hallucinated.push({
        ...imp,
        reason: `does not export "${imp.export}"`,
        available: exports.slice(0, 8),
        suggested: suggested.length ? `Did you mean: ${suggested.join(', ')}?` : undefined,
      });
    }
  }
  return hallucinated;
}

/**
 * Detects hallucinated imports in diff (Node.js only).
 * @param {string} diff
 * @param {string} workspace
 * @returns {Promise<{ count: number, list: Array<{ module: string, export: string | null, file: string, line: number, reason: string, available?: string[], suggested?: string }> }>}
 */
async function detectHallucinatedImports(diff, workspace) {
  const imports = extractImportsFromDiff(diff);
  const list = await validateImports(imports, workspace);
  return { count: list.length, list };
}

module.exports = {
  extractImportsFromDiff,
  validateImports,
  detectHallucinatedImports,
};
