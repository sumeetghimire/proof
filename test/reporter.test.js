/**
 * Tests for src/reporter.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { buildReport, formatComment, COMMENT_HEADER } = require('../src/reporter.js');

describe('reporter', () => {
  describe('buildReport', () => {
    it('returns READY when all pass', () => {
      const r = buildReport({
        build: { success: true },
        tests: { success: true },
        hallucinations: { count: 0, list: [] },
        issue: { linkedIssue: 1, addressed: true, reason: 'ok' },
      });
      assert.strictEqual(r.verdict, 'READY');
    });
    it('returns NOT_READY when tests fail', () => {
      const r = buildReport({
        build: { success: true },
        tests: { success: false },
      });
      assert.strictEqual(r.verdict, 'NOT_READY');
    });
    it('returns NEEDS_REVIEW when only warnings', () => {
      const r = buildReport({
        build: { success: true },
        tests: { success: true },
        hallucinations: { count: 1, list: [{ call: 'x', file: 'a', line: 1, reason: 'y' }] },
      });
      assert.strictEqual(r.verdict, 'NEEDS_REVIEW');
    });
  });

  describe('formatComment', () => {
    it('includes header and verdict', () => {
      const report = buildReport({
        tests: { success: true },
      });
      const body = formatComment(report);
      assert.ok(body.includes(COMMENT_HEADER));
      assert.ok(body.includes('READY') || body.includes('NOT_READY') || body.includes('NEEDS_REVIEW'));
    });
    it('includes table and test result', () => {
      const report = buildReport({
        tests: { success: true, passing: 5 },
      });
      const body = formatComment(report);
      assert.ok(body.includes('| Check |'));
      assert.ok(body.includes('Tests'));
    });
  });
});
