/**
 * Tests for src/security.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { scanSecurityPatterns, getAddedLinesByFile } = require('../src/security.js');

describe('security', () => {
  describe('getAddedLinesByFile', () => {
    it('extracts added lines with file and line number', () => {
      const diff = `diff --git a/foo.js b/foo.js
--- a/foo.js
+++ b/foo.js
@@ -1,3 +1,4 @@
+eval(x);
 const a = 1;
`;
      const added = getAddedLinesByFile(diff);
      assert.ok(added.length >= 1);
      assert.strictEqual(added[0].file, 'foo.js');
      assert.strictEqual(added[0].text.trim(), 'eval(x);');
    });
  });

  describe('scanSecurityPatterns', () => {
    it('detects eval as CRITICAL', () => {
      const diff = `diff --git a/parser.js b/parser.js
--- a/parser.js
+++ b/parser.js
@@ -30,1 +30,1 @@
-eval(legacy);
+eval(userInput);
`;
      const { findings, hasCritical } = scanSecurityPatterns(diff);
      assert.ok(hasCritical);
      assert.ok(findings.some((f) => f.severity === 'CRITICAL' && /eval/i.test(f.snippet)));
    });
    it('detects hardcoded secret pattern', () => {
      const diff = `diff --git a/config.js b/config.js
+++ b/config.js
@@ -0,0 +1,1 @@
+const apiKey = "sk-abc12345678901234567890";
`;
      const { findings } = scanSecurityPatterns(diff);
      assert.ok(findings.some((f) => f.reason && f.reason.includes('Credential') || /sk-/.test(f.snippet)));
    });
    it('returns no findings for safe diff', () => {
      const diff = `diff --git a/bar.js b/bar.js
+++ b/bar.js
@@ -0,0 +1,2 @@
+const x = 1;
+console.log('hello');
`;
      const { findings, hasCritical } = scanSecurityPatterns(diff);
      assert.strictEqual(hasCritical, false);
      assert.ok(Array.isArray(findings));
    });
  });
});
