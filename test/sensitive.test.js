/**
 * Tests for src/sensitive.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkSensitiveFiles } = require('../src/sensitive.js');

describe('sensitive', () => {
  it('flags workflow file as critical', () => {
    const diff = 'diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml\n--- a/.github/workflows/ci.yml\n+++ b/.github/workflows/ci.yml';
    const { critical, high, medium } = checkSensitiveFiles(diff);
    assert.ok(critical.some((c) => c.path.includes('workflows')));
    assert.ok(critical.some((c) => c.reason && c.reason.includes('CI')));
  });
  it('flags Dockerfile as critical', () => {
    const diff = 'diff --git a/Dockerfile b/Dockerfile\n--- a/Dockerfile\n+++ b/Dockerfile';
    const { critical } = checkSensitiveFiles(diff);
    assert.ok(critical.some((c) => /Dockerfile/i.test(c.path)));
  });
  it('flags package.json as high', () => {
    const diff = 'diff --git a/package.json b/package.json\n--- a/package.json\n+++ b/package.json';
    const { high } = checkSensitiveFiles(diff);
    assert.ok(high.some((h) => /package\.json/i.test(h.path)));
  });
  it('returns empty when no sensitive files changed', () => {
    const diff = 'diff --git a/src/foo.js b/src/foo.js\n--- a/src/foo.js\n+++ b/src/foo.js';
    const { critical, high } = checkSensitiveFiles(diff);
    assert.strictEqual(critical.length, 0);
    assert.strictEqual(high.length, 0);
  });
});
