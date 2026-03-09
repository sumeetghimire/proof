/**
 * Tests for src/timeout.js.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const { withTimeout } = require('../src/timeout.js');

describe('timeout', () => {
  it('resolves when promise resolves before timeout', async () => {
    const result = await withTimeout(Promise.resolve(42), 5, 'test');
    assert.strictEqual(result, 42);
  });
  it('rejects with timedOut when timeout fires', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 500));
    try {
      await withTimeout(slow, 0.05, 'slow step');
      assert.fail('expected reject');
    } catch (err) {
      assert.strictEqual(err.timedOut, true);
      assert.strictEqual(err.step, 'slow step');
    }
  });
});
