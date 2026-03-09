/**
 * Runs install, build, and tests on the GitHub Actions runner (no Docker).
 * Uses exec.js to run commands in the workspace.
 */

const { runCommand } = require('./exec.js');
const { parseTestOutput } = require('./parse-test-output.js');

/**
 * Installs dependencies using the build system's install command.
 * @param {{ installCommand: string }} buildSystem - From detectBuildSystem (installCommand required)
 * @param {string} workspace - Absolute path to repo (e.g. GITHUB_WORKSPACE)
 * @returns {Promise<{ success: boolean, output: string, error: string }>}
 */
async function installDependencies(buildSystem, workspace) {
  const cmd = buildSystem.installCommand;
  if (!cmd) {
    return { success: true, output: '', error: '' };
  }
  const result = await runCommand(workspace, cmd);
  return {
    success: result.exitCode === 0,
    output: result.stdout,
    error: result.stderr,
  };
}

/**
 * Runs the build command in the workspace.
 * @param {string | null} buildCommand - From detectBuildSystem, or null to skip
 * @param {string} workspace - Absolute path to repo
 * @returns {Promise<{ success: boolean, output: string, error: string, duration: number }>}
 */
async function runBuild(buildCommand, workspace) {
  if (!buildCommand) {
    return { success: true, output: '', error: '', duration: 0 };
  }
  const start = Date.now();
  const result = await runCommand(workspace, buildCommand);
  const duration = Date.now() - start;
  return {
    success: result.exitCode === 0,
    output: result.stdout,
    error: result.stderr,
    duration,
  };
}

/**
 * Runs the test suite in the workspace and returns results.
 * @param {string} testCommand - From detectBuildSystem
 * @param {string} workspace - Absolute path to repo
 * @returns {Promise<{ success: boolean, output: string, error: string, exitCode: number, totalTests?: number, passing?: number, failing?: number }>}
 */
async function runTests(testCommand, workspace) {
  if (!testCommand) {
    return { success: true, output: '', error: '', exitCode: 0 };
  }
  const result = await runCommand(workspace, testCommand);
  const combined = result.stdout + '\n' + result.stderr;
  const parsed = parseTestOutput(combined);
  return {
    success: result.exitCode === 0,
    output: combined,
    error: result.stderr,
    exitCode: result.exitCode,
    ...parsed,
  };
}

module.exports = {
  installDependencies,
  runBuild,
  runTests,
  parseTestOutput,
};
