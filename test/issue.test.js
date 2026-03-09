/**
 * Tests for src/issue.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const {
  extractLinkedIssue,
  getChangedFilesFromDiff,
  extractKeywords,
  checkIssueAddressed,
} = require('../src/issue.js');

describe('issue', () => {
  describe('extractLinkedIssue', () => {
    it('finds Fixes #42 in body', () => {
      assert.strictEqual(extractLinkedIssue('Fixes #42', ''), 42);
    });
    it('finds Closes #123 in body', () => {
      assert.strictEqual(extractLinkedIssue('Closes #123\n\nDescription.', ''), 123);
    });
    it('finds issue in title', () => {
      assert.strictEqual(extractLinkedIssue('', 'Resolves #99'), 99);
    });
    it('returns null when no link', () => {
      assert.strictEqual(extractLinkedIssue('No issue here', 'Just a title'), null);
    });
  });

  describe('getChangedFilesFromDiff', () => {
    it('returns changed file paths', () => {
      const diff = 'diff --git a/src/foo.js b/src/foo.js\n--- a/src/foo.js\n+++ b/src/foo.js\ndiff --git a/readme.md b/readme.md';
      assert.deepStrictEqual(getChangedFilesFromDiff(diff), ['src/foo.js', 'readme.md']);
    });
  });

  describe('extractKeywords', () => {
    it('returns unique words of length >= 2', () => {
      const w = extractKeywords('Fix null pointer in auth middleware');
      assert.ok(w.includes('fix'));
      assert.ok(w.includes('null'));
      assert.ok(w.includes('auth'));
    });
  });

  describe('checkIssueAddressed', () => {
    it('returns addressed when issue terms appear in diff', () => {
      const issue = { title: 'Fix auth bug', body: 'The auth middleware crashes.' };
      const diff = 'diff --git a/auth.js b/auth.js\n+fix auth middleware';
      const r = checkIssueAddressed(issue, diff, null, 42);
      assert.strictEqual(r.linkedIssue, 42);
      assert.ok(r.addressed);
      assert.ok(['HIGH', 'MEDIUM'].includes(r.confidence));
    });
    it('returns not addressed when no overlap', () => {
      const issue = { title: 'Fix database connection', body: 'PostgreSQL timeout.' };
      const diff = 'diff --git a/readme.md b/readme.md\n+hello';
      const r = checkIssueAddressed(issue, diff, null, 1);
      assert.strictEqual(r.addressed, false);
      assert.strictEqual(r.confidence, 'LOW');
    });
  });
});
