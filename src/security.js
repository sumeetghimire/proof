/**
 * Security pattern scan: detect dangerous patterns in added diff lines only.
 */

const CRITICAL_PATTERNS = [
  { re: /\beval\s*\(/i, reason: 'Arbitrary code execution' },
  { re: /child_process\.(exec|execSync)\s*\(/i, reason: 'Shell command injection' },
  { re: /child_process\.spawn\s*\(/i, reason: 'Spawns shell processes' },
  { re: /\bos\.system\s*\(|subprocess\.call\s*\(/i, reason: 'Python shell execution' },
  { re: /shell_exec\s*\(|system\s*\(/i, reason: 'PHP shell execution' },
];
const SECRET_PATTERNS = [
  { re: /(?:api[_-]?key|apikey|secret|password|token|passwd)\s*=\s*['"][^'"]{8,}/i, reason: 'Credential exposure' },
  { re: /sk-[a-zA-Z0-9]{20,}/, reason: 'OpenAI key pattern' },
  { re: /AKIA[0-9A-Z]{16}/, reason: 'AWS key pattern' },
  { re: /ghp_[a-zA-Z0-9]{36}/, reason: 'GitHub token pattern' },
];
const HIGH_PATTERNS = [
  ...SECRET_PATTERNS,
  { re: /process\.env\s*\[[^\]]+\]\s*=/, reason: 'Writing to env' },
  { re: /__import__\s*\(/i, reason: 'Dynamic import (Python)' },
];
const MEDIUM_PATTERNS = [
  { re: /\.innerHTML\s*=/, reason: 'XSS risk' },
  { re: /document\.write\s*\(/i, reason: 'XSS risk' },
  { re: /dangerouslySetInnerHTML/i, reason: 'XSS risk' },
  { re: /pickle\.loads\s*\(/i, reason: 'Deserialization (Python)' },
  { re: /unserialize\s*\(/i, reason: 'Deserialization (PHP)' },
];
const LOW_PATTERNS = [
  { re: /console\.log\s*\([^)]*\+/i, reason: 'Possible data leak' },
  { re: /\b(?:TODO|FIXME)\b/i, reason: 'Unfinished code' },
  { re: /\bdebugger\s*;/, reason: 'Debugger statement' },
];

/**
 * Splits diff into per-file blocks and returns added lines with file and line number.
 * @param {string} diff
 * @returns {{ file: string, lineNum: number, text: string }[]}
 */
function getAddedLinesByFile(diff) {
  const blocks = [];
  const fileRe = /^diff --git a\/.+? b\/(.+)$/gm;
  const hunkRe = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/gm;
  let currentFile = null;
  let currentLine = null;
  let m;
  const lines = diff.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if ((m = /^diff --git a\/.+? b\/(.+)$/.exec(line))) {
      currentFile = m[1];
      currentLine = null;
      continue;
    }
    if ((m = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line))) {
      currentLine = parseInt(m[1], 10);
      continue;
    }
    if (line.startsWith('+') && !line.startsWith('+++') && currentFile != null && currentLine != null) {
      blocks.push({ file: currentFile, lineNum: currentLine, text: line.slice(1) });
    }
    if ((line.startsWith('+') && !line.startsWith('+++')) || (line.startsWith(' ') && currentLine != null)) {
      if (currentLine != null) currentLine++;
    }
  }
  return blocks;
}

/**
 * Scans added lines for security patterns. Returns findings by severity.
 * @param {string} diff - PR unified diff
 * @returns {{ findings: { severity: string, file: string, line: number, snippet: string, reason: string }[], hasCritical: boolean }}
 */
function scanSecurityPatterns(diff) {
  const added = getAddedLinesByFile(diff);
  const findings = [];
  for (const { file, lineNum, text } of added) {
    const run = (list, severity) => {
      for (const { re, reason } of list) {
        if (re.test(text)) {
          findings.push({
            severity,
            file,
            line: lineNum,
            snippet: text.trim().slice(0, 80),
            reason,
          });
          break;
        }
      }
    };
    run(CRITICAL_PATTERNS, 'CRITICAL');
    run(HIGH_PATTERNS, 'HIGH');
    run(MEDIUM_PATTERNS, 'MEDIUM');
    run(LOW_PATTERNS, 'LOW');
  }
  const hasCritical = findings.some((f) => f.severity === 'CRITICAL');
  return { findings, hasCritical };
}

module.exports = {
  scanSecurityPatterns,
  getAddedLinesByFile,
};
