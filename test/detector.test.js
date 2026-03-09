/**
 * Tests for src/detector.js (language and build-system detection).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { detectLanguage, detectBuildSystem, fileExists } = require('../src/detector.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');
const NODE_PROJECT = path.join(FIXTURES, 'node-project');

describe('detector', () => {
  describe('fileExists', () => {
    it('returns true for existing file', async () => {
      const ok = await fileExists(NODE_PROJECT, 'package.json');
      assert.strictEqual(ok, true);
    });
    it('returns false for missing file', async () => {
      const ok = await fileExists(NODE_PROJECT, 'nonexistent.json');
      assert.strictEqual(ok, false);
    });
  });

  describe('detectLanguage', () => {
    it('detects Node.js from package.json', async () => {
      const result = await detectLanguage(NODE_PROJECT);
      assert.ok(result);
      assert.strictEqual(result.language, 'node');
      assert.strictEqual(result.version, '18');
    });
    it('returns null for empty or unknown directory', async () => {
      const result = await detectLanguage(path.join(FIXTURES, 'nonexistent'));
      assert.strictEqual(result, null);
    });
  });

  describe('detectBuildSystem', () => {
    it('returns npm build/test/install for Node project', async () => {
      const lang = await detectLanguage(NODE_PROJECT);
      assert.ok(lang);
      const build = await detectBuildSystem(NODE_PROJECT, lang);
      assert.strictEqual(build.installCommand, 'npm install');
      assert.strictEqual(build.testCommand, 'npm test');
      assert.strictEqual(build.buildCommand, 'npm run build');
    });
  });
});
