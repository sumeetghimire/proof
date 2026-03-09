/**
 * PRoof - GitHub Action entry point.
 * Verifies pull requests actually fix what they claim to fix.
 * Reads inputs, PR context, runs install/build/tests on the runner, and reporting.
 */

const path = require('path');
const core = require('@actions/core');
const github = require('@actions/github');
const { detectLanguage, detectBuildSystem } = require('./detector.js');
const { installDependencies, runBuild, runTests } = require('./runner.js');
const { detectHallucinations } = require('./hallucination.js');
const { extractLinkedIssue, fetchIssue, checkIssueAddressed } = require('./issue.js');
const { buildReport, formatComment, postComment } = require('./reporter.js');
const { checkDependencyRisks } = require('./dependency.js');
const { detectHallucinatedImports } = require('./imports.js');
const { checkScope } = require('./scope.js');
const { scanSecurityPatterns } = require('./security.js');
const { withTimeout } = require('./timeout.js');
const { checkSensitiveFiles } = require('./sensitive.js');

/**
 * Parses a boolean action input (handles empty string as default true/false).
 * @param {string} name - Input name
 * @param {string} defaultValue - 'true' or 'false'
 * @returns {boolean}
 */
function getBooleanInput(name, defaultValue = 'true') {
  const raw = core.getInput(name) || defaultValue;
  return raw.toLowerCase() === 'true';
}

/**
 * Main action entry. Reads inputs and PR context, runs checks, and posts the report.
 * Orchestrates detector, runner (exec), hallucination, issue, reporter.
 */
async function run() {
  try {
    const githubToken = core.getInput('github_token', { required: true });
    const runTestsFlag = getBooleanInput('run_tests', 'true');
    const checkIssue = getBooleanInput('check_issue', 'true');
    const detectHallucinationsFlag = getBooleanInput('detect_hallucinations', 'true');
    const blockMerge = getBooleanInput('block_merge', 'false');
    const checkDependencies = getBooleanInput('check_dependencies', 'true');
    const checkImports = getBooleanInput('check_imports', 'true');
    const checkScopeFlag = getBooleanInput('check_scope', 'true');
    const securityScan = getBooleanInput('security_scan', 'true');
    const buildTimeoutSec = Math.max(60, parseInt(core.getInput('build_timeout') || '120', 10));
    const testTimeoutSec = Math.max(60, parseInt(core.getInput('test_timeout') || '300', 10));
    const checkSensitiveFilesFlag = getBooleanInput('check_sensitive_files', 'true');
    const languages = core.getInput('languages') || '';

    const payload = github.context.payload;
    const pullRequest = payload.pull_request;
    const repo = payload.repository;

    core.info('PRoof inputs:');
    core.info(`  run_tests: ${runTestsFlag}`);
    core.info(`  check_issue: ${checkIssue}`);
    core.info(`  detect_hallucinations: ${detectHallucinationsFlag}`);
    core.info(`  block_merge: ${blockMerge}`);
    core.info(`  check_dependencies: ${checkDependencies}`);
    core.info(`  check_imports: ${checkImports}`);
    core.info(`  check_scope: ${checkScopeFlag}`);
    core.info(`  security_scan: ${securityScan}`);
    core.info(`  build_timeout: ${buildTimeoutSec}s`);
    core.info(`  test_timeout: ${testTimeoutSec}s`);
    core.info(`  check_sensitive_files: ${checkSensitiveFilesFlag}`);
    core.info(`  languages: ${languages === '' ? '(auto-detect)' : languages}`);

    if (pullRequest) {
      core.info('PR context:');
      core.info(`  number: ${pullRequest.number}`);
      core.info(`  title: ${pullRequest.title}`);
      core.info(`  head.ref: ${pullRequest.head?.ref}`);
      core.info(`  base.ref: ${pullRequest.base?.ref}`);
    }
    if (repo) {
      core.info(`  repo: ${repo.owner?.login}/${repo.name}`);
    }

    const results = {};
    let prDiff = '';
    if ((checkIssue || detectHallucinationsFlag || checkDependencies || checkImports || checkScopeFlag || securityScan || checkSensitiveFilesFlag) && pullRequest && repo) {
      try {
        const octokit = github.getOctokit(githubToken);
        const { data } = await octokit.rest.pulls.get({
          owner: repo.owner.login,
          repo: repo.name,
          pull_number: pullRequest.number,
          mediaType: { format: 'diff' },
        });
        prDiff = typeof data === 'string' ? data : '';
      } catch (e) {
        core.warning('Could not fetch PR diff: ' + (e && e.message));
      }
    }

    if (checkDependencies && prDiff) {
      try {
        const depResult = await checkDependencyRisks(prDiff);
        results.dependencies = { risks: depResult.risks, hasTyposquat: depResult.hasTyposquat };
        if (depResult.risks.length > 0) {
          core.warning(`Dependency risks: ${depResult.risks.length} new dependency(ies) flagged`);
        }
      } catch (e) {
        core.warning('Dependency check failed: ' + (e && e.message));
        results.dependencies = { risks: [], hasTyposquat: false };
      }
    }

    const workspace = process.env.GITHUB_WORKSPACE || path.resolve(__dirname, '..');

    if (checkImports && prDiff) {
      try {
        const importResult = await detectHallucinatedImports(prDiff, workspace);
        results.imports = { count: importResult.count, list: importResult.list };
        if (importResult.count > 0) {
          core.warning(`Hallucinated imports: ${importResult.count} found`);
        }
      } catch (e) {
        core.warning('Import check failed: ' + (e && e.message));
        results.imports = { count: 0, list: [] };
      }
    }
    if (securityScan && prDiff) {
      try {
        const sec = scanSecurityPatterns(prDiff);
        results.security = { findings: sec.findings, hasCritical: sec.hasCritical };
        if (sec.findings.length > 0) {
          core.warning(`Security scan: ${sec.findings.length} finding(s), critical: ${sec.hasCritical}`);
        }
      } catch (e) {
        core.warning('Security scan failed: ' + (e && e.message));
        results.security = { findings: [], hasCritical: false };
      }
    }
    if (checkSensitiveFilesFlag && prDiff) {
      try {
        results.sensitive = checkSensitiveFiles(prDiff);
        const { critical, high } = results.sensitive;
        if (critical.length > 0 || high.length > 0) {
          core.warning(`Sensitive files: ${critical.length} critical, ${high.length} high`);
        }
      } catch (e) {
        core.warning('Sensitive files check failed: ' + (e && e.message));
        results.sensitive = { critical: [], high: [], medium: [] };
      }
    }
    const lang = await detectLanguage(workspace);
    if (lang) {
      core.info(`Detected language: ${lang.language}${lang.version ? ` (${lang.version})` : ''}`);
      const build = await detectBuildSystem(workspace, lang);
      core.info(`  install: ${build.installCommand}`);
      core.info(`  test: ${build.testCommand}`);
      if (build.buildCommand) core.info(`  build: ${build.buildCommand}`);

      if (runTestsFlag) {
        try {
          const installResult = await withTimeout(
            installDependencies(build, workspace),
            buildTimeoutSec,
            'dependency install'
          );
          results.install = { success: installResult.success };
          if (installResult.success) {
            core.info('Dependencies installed.');
          } else {
            core.warning('Install failed: ' + (installResult.error || '').slice(0, 200));
          }
        } catch (installErr) {
          if (installErr && installErr.timedOut) {
            results.timeout = { step: installErr.step, lastOutput: installErr.lastOutput || '' };
            core.warning(`Timeout: ${installErr.step} (${buildTimeoutSec}s)`);
          } else {
            throw installErr;
          }
        }
        if (!results.timeout) {
          try {
            const buildResult = await withTimeout(
              runBuild(build.buildCommand, workspace),
              buildTimeoutSec,
              'build'
            );
            if (build.buildCommand) {
              results.build = { success: buildResult.success, duration: buildResult.duration, error: buildResult.error };
              core.info(buildResult.success ? `Build passed (${buildResult.duration}ms).` : `Build failed: ${(buildResult.error || '').slice(0, 200)}`);
            }
          } catch (buildErr) {
            if (buildErr && buildErr.timedOut) {
              results.timeout = { step: buildErr.step, lastOutput: buildErr.lastOutput || '' };
              core.warning(`Timeout: ${buildErr.step} (${buildTimeoutSec}s)`);
            } else {
              throw buildErr;
            }
          }
        }
        if (!results.timeout) {
          try {
            const testResult = await withTimeout(
              runTests(build.testCommand, workspace),
              testTimeoutSec,
              'test suite'
            );
            results.tests = {
              success: testResult.success,
              output: testResult.output,
              exitCode: testResult.exitCode,
              passing: testResult.passing,
              failing: testResult.failing,
            };
            if (testResult.success) {
              core.info(`Tests passed${testResult.passing != null ? ` (${testResult.passing} passing)` : ''}.`);
            } else {
              core.error(`Tests failed (exit ${testResult.exitCode}).`);
              if (testResult.output) core.error(testResult.output.slice(-1500));
            }
          } catch (testErr) {
            if (testErr && testErr.timedOut) {
              results.timeout = { step: testErr.step, lastOutput: testErr.lastOutput || '' };
              core.warning(`Timeout: ${testErr.step} (${testTimeoutSec}s)`);
            } else {
              throw testErr;
            }
          }
        }
        if (!results.timeout && detectHallucinationsFlag && prDiff) {
          const { hallucinations, count } = await detectHallucinations(prDiff, lang, workspace);
          results.hallucinations = { count, list: hallucinations };
          if (count > 0) {
            core.warning(`Hallucinated APIs: ${count}`);
            hallucinations.slice(0, 5).forEach((h) => core.warning(`  ${h.call} in ${h.file}:${h.line} — ${h.reason}`));
          } else {
            core.info('No hallucinated APIs detected.');
          }
        }
      }
    } else {
      core.info('No supported language detected.');
    }

    if (checkIssue && pullRequest && repo && prDiff) {
      const issueNum = extractLinkedIssue(pullRequest.body || '', pullRequest.title || '');
      if (issueNum) {
        const octokit = github.getOctokit(githubToken);
        const issue = await fetchIssue(octokit, repo.owner.login, repo.name, issueNum);
        if (issue) {
          const result = checkIssueAddressed(issue, prDiff, null, issueNum);
          results.issue = { linkedIssue: issueNum, addressed: result.addressed, reason: result.reason };
          if (checkScopeFlag && prDiff) {
            results.scope = checkScope(issue, prDiff, issueNum);
            if (results.scope.unrelatedCount > 0) {
              core.warning(`PR scope: ${results.scope.unrelatedCount} file(s) unrelated to issue #${issueNum}`);
            }
          }
          if (result.addressed) {
            core.info(`Issue #${issueNum} appears addressed (${result.confidence} confidence).`);
          } else {
            core.warning(`Issue #${issueNum} may not be addressed: ${result.reason}`);
          }
        } else {
          core.warning(`Could not fetch issue #${issueNum}.`);
        }
      } else {
        core.info('No linked issue found in PR title/body.');
      }
    }

    const report = buildReport(results);
    const commentBody = formatComment(report);
    core.info(`Verdict: ${report.verdict}`);
    if (pullRequest && repo) {
      try {
        const octokit = github.getOctokit(githubToken);
        await postComment(octokit, repo.owner.login, repo.name, pullRequest.number, commentBody);
        core.info('Posted PRoof comment on PR.');
      } catch (e) {
        core.warning('Could not post PR comment: ' + (e && e.message));
      }
    }
    if (blockMerge && report.verdict === 'NOT_READY') {
      core.setFailed('PRoof verification did not pass. Resolve issues before merging.');
    }

    core.info('PRoof verification complete.');
    process.exit(0);
  } catch (error) {
    core.setFailed(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

run();
