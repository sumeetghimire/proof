/**
 * Fixture: minimal Node.js test file for detector tests.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { greet } = require('./index.js');

describe('greet', () => {
  it('returns greeting', () => {
    assert.strictEqual(greet('world'), 'Hello, world');
  });
});
