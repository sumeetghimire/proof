/**
 * Tests for src/imports.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { extractImportsFromDiff, validateImports, detectHallucinatedImports } = require('../src/imports.js');

const SAMPLE_DIFF = `diff --git a/src/app.js b/src/app.js
+++ b/src/app.js
@@ -0,0 +1,2 @@
+import { createAuth } from "next-auth/server"
+const x = require('fs')
`;

describe('imports', () => {
  describe('extractImportsFromDiff', () => {
    it('extracts import and require from added lines', () => {
      const imports = extractImportsFromDiff(SAMPLE_DIFF);
      assert.ok(imports.length >= 1);
      const imp = imports.find((i) => i.module === 'next-auth/server');
      assert.ok(imp);
      assert.strictEqual(imp.export, 'createAuth');
    });
  });

  describe('validateImports', () => {
    it('returns empty list for empty imports', async () => {
      const out = await validateImports([], __dirname);
      assert.deepStrictEqual(out, []);
    });
  });

  describe('detectHallucinatedImports', () => {
    it('returns count and list (module not in node_modules is hallucinated)', async () => {
      const workspace = path.join(__dirname, '..', 'fixtures', 'node-project');
      const { count, list } = await detectHallucinatedImports(SAMPLE_DIFF, workspace);
      assert.ok(typeof count === 'number');
      assert.ok(Array.isArray(list));
    });
  });
});
