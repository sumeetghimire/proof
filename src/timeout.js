/**
 * Execution timeout: wrap promises with a time limit; reject with step name if exceeded.
 */

/**
 * Wraps a promise with a timeout. Rejects with { timedOut: true, step, lastOutput } if timeout fires.
 * @param {Promise<T>} promise - The operation (e.g. exec result)
 * @param {number} ms - Timeout in seconds (converted to ms internally)
 * @param {string} step - Step name for reporting (e.g. 'dependency install', 'build', 'test suite')
 * @param {string} [lastOutput] - Optional last output to include when timing out
 * @returns {Promise<T>}
 */
function withTimeout(promise, ms, step, lastOutput = '') {
  const msActual = typeof ms === 'number' && ms > 0 ? ms * 1000 : 120000;
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(
        Object.assign(new Error(`Timed out after ${ms}s`), {
          timedOut: true,
          step,
          lastOutput: lastOutput || '',
        })
      );
    }, msActual);
  });
  return Promise.race([promise, timeoutPromise]);
}

module.exports = {
  withTimeout,
};
