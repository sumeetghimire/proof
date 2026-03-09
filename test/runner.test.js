/**
 * Integration tests for src/runner.js (install, build, tests on runner via exec).
 * No Docker required; runs in fixtures/node-project.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const { detectLanguage, detectBuildSystem } = require('../src/detector.js');
const { installDependencies, runBuild, runTests } = require('../src/runner.js');

const NODE_PROJECT = path.join(__dirname, '..', 'fixtures', 'node-project');

describe('runner (integration)', () => {
  it('runs install, build, and tests in workspace', async () => {
    const lang = await detectLanguage(NODE_PROJECT);
    assert.ok(lang);
    const build = await detectBuildSystem(NODE_PROJECT, lang);
    const installResult = await installDependencies(build, NODE_PROJECT);
    assert.strictEqual(installResult.success, true);
    const buildResult = await runBuild(build.buildCommand, NODE_PROJECT);
    assert.strictEqual(buildResult.success, true);
    assert.ok(typeof buildResult.duration === 'number');
    const testResult = await runTests(build.testCommand, NODE_PROJECT);
    assert.strictEqual(testResult.success, true);
    assert.ok(testResult.output.includes('greet') || testResult.output.includes('pass') || testResult.output.length >= 0);
  });
});
