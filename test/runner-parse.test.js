/**
 * Unit tests for parseTestOutput only. No Docker/sandbox deps — exits immediately.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { parseTestOutput } = require('../src/parse-test-output.js');

describe('parseTestOutput', () => {
  it('parses Node.js built-in test output', () => {
    const out = 'ℹ tests 5\nℹ pass 5\nℹ fail 0';
    assert.deepStrictEqual(parseTestOutput(out), {
      totalTests: 5,
      passing: 5,
      failing: 0,
    });
  });
  it('parses Jest-style output', () => {
    const out = 'Tests: 3 passed, 3 total';
    assert.deepStrictEqual(parseTestOutput(out), {
      totalTests: 3,
      passing: 3,
      failing: 0,
    });
  });
  it('returns empty object for unknown format', () => {
    assert.deepStrictEqual(parseTestOutput('some log'), {});
  });
});
