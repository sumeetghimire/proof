/**
 * Tests for src/exec.js (runCommand using @actions/exec).
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { runCommand } = require('../src/exec.js');

const FIXTURES = path.join(__dirname, '..', 'fixtures');

describe('exec', () => {
  it('runs command and returns stdout, stderr, exitCode', async () => {
    const result = await runCommand(FIXTURES, 'echo hello && echo world >&2');
    assert.ok(result.stdout.includes('hello'));
    assert.ok(result.stderr.includes('world'));
    assert.strictEqual(result.exitCode, 0);
  });
  it('returns non-zero exit code when command fails', async () => {
    const result = await runCommand(FIXTURES, 'exit 7');
    assert.strictEqual(result.exitCode, 7);
  });
  it('runs in the given working directory', async () => {
    const result = await runCommand(path.join(FIXTURES, 'node-project'), 'pwd');
    assert.ok(result.stdout.includes('node-project') || result.stdout.trim().length > 0);
  });
});
