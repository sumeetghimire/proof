/**
 * Parses test runner output for pass/fail counts. No dependencies (used by runner and tests).
 * @param {string} output - Combined stdout + stderr from test run
 * @returns {{ totalTests?: number, passing?: number, failing?: number }}
 */
function parseTestOutput(output) {
  const out = output;
  const nodeTestMatch = out.match(/ℹ\s+tests\s+(\d+)/);
  const nodePassMatch = out.match(/ℹ\s+pass\s+(\d+)/);
  const nodeFailMatch = out.match(/ℹ\s+fail\s+(\d+)/);
  if (nodeTestMatch && nodePassMatch) {
    return {
      totalTests: parseInt(nodeTestMatch[1], 10),
      passing: parseInt(nodePassMatch[1], 10),
      failing: nodeFailMatch ? parseInt(nodeFailMatch[1], 10) : 0,
    };
  }
  const jestMatch = out.match(/Tests:\s*(\d+)\s+passed(?:,\s*(\d+)\s+total)?/);
  if (jestMatch) {
    const passed = parseInt(jestMatch[1], 10);
    const total = jestMatch[2] ? parseInt(jestMatch[2], 10) : passed;
    return { totalTests: total, passing: passed, failing: total - passed };
  }
  return {};
}

module.exports = { parseTestOutput };
