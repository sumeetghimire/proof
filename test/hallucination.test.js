/**
 * Tests for src/hallucination.js (extractAPICalls, parseDiffFiles).
 * Validation/detect tests require Docker and are optional.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  extractAPICalls,
  parseDiffFiles,
} = require('../src/hallucination.js');

const SAMPLE_DIFF = `diff --git a/src/api.js b/src/api.js
index 123..456 100644
--- a/src/api.js
+++ b/src/api.js
@@ -1,3 +1,5 @@
 const axios = require('axios');
+axios.postWithRetry('/users', { name: 'x' });
+const x = fs.readFileSync('a', 'utf8', 'extra');
 `;

describe('hallucination', () => {
  describe('parseDiffFiles', () => {
    it('extracts file and added lines from diff', () => {
      const blocks = parseDiffFiles(SAMPLE_DIFF);
      assert.strictEqual(blocks.length, 1);
      assert.strictEqual(blocks[0].file, 'src/api.js');
      assert.ok(blocks[0].lines.some((l) => l.includes('postWithRetry')));
    });
    it('ignores non-JS files', () => {
      const diff = 'diff --git a/readme.md b/readme.md\n+++ b/readme.md\n+hello';
      assert.strictEqual(parseDiffFiles(diff).length, 0);
    });
  });

  describe('extractAPICalls', () => {
    it('finds method calls in added code', () => {
      const calls = extractAPICalls(SAMPLE_DIFF);
      assert.ok(calls.length >= 1);
      const postCall = calls.find((c) => c.method === 'postWithRetry');
      assert.ok(postCall);
      assert.strictEqual(postCall.object, 'axios');
      assert.strictEqual(postCall.file, 'src/api.js');
    });
  });
});
