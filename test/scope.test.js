/**
 * Tests for src/scope.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { checkScope } = require('../src/scope.js');

describe('scope', () => {
  it('classifies relevant and unrelated files', () => {
    const issue = { title: 'Fix login authentication bug', body: 'The auth middleware crashes on invalid tokens.' };
    const diff = 'diff --git a/auth/login.js b/auth/login.js\n--- a/auth/login.js\n+++ b/auth/login.js\ndiff --git a/payments/api.js b/payments/api.js\n--- a/payments/api.js\n+++ b/payments/api.js';
    const result = checkScope(issue, diff, 42);
    assert.strictEqual(result.issueNumber, 42);
    assert.ok(result.relevant.some((f) => f.includes('auth') || f.includes('login')));
    assert.ok(result.unrelated.some((f) => f.includes('payments')));
    assert.strictEqual(result.unrelatedCount, result.unrelated.length);
  });

  it('returns empty arrays when no changed files', () => {
    const issue = { title: 'Fix bug', body: 'Description' };
    const result = checkScope(issue, '', 1);
    assert.deepStrictEqual(result.relevant, []);
    assert.deepStrictEqual(result.possiblyRelated, []);
    assert.deepStrictEqual(result.unrelated, []);
    assert.strictEqual(result.unrelatedCount, 0);
  });
});
