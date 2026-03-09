/**
 * Runs shell commands on the GitHub Actions runner using @actions/exec.
 * The runner is the sandbox; no Docker required.
 */

const { getExecOutput } = require('@actions/exec');

/**
 * Runs a shell command in the given working directory and returns stdout, stderr, and exit code.
 * @param {string} workingDir - Absolute path to the workspace (e.g. GITHUB_WORKSPACE)
 * @param {string} command - Shell command to run (e.g. "npm install", "npm test")
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
async function runCommand(workingDir, command) {
  const result = await getExecOutput('sh', ['-c', command], {
    cwd: workingDir,
    silent: true,
    ignoreReturnCode: true,
  });
  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.exitCode ?? -1,
  };
}

module.exports = {
  runCommand,
};
