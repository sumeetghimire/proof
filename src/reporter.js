/**
 * Builds the verification report, formats it as markdown, and posts/updates the PR comment.
 */

const COMMENT_HEADER = '## PRoof Verification Report';

/**
 * Determines overall verdict from all check results.
 * @param {object} results - Aggregated results: { build, tests, install, hallucinations, issue }
 * @returns {{ verdict: 'READY'|'NEEDS_REVIEW'|'NOT_READY', report: object }}
 */
function buildReport(results) {
  const report = {
    build: results.build ?? null,
    tests: results.tests ?? null,
    install: results.install ?? null,
    hallucinations: results.hallucinations ?? null,
    issue: results.issue ?? null,
    dependencies: results.dependencies ?? null,
    imports: results.imports ?? null,
    scope: results.scope ?? null,
    security: results.security ?? null,
    timeout: results.timeout ?? null,
    sensitive: results.sensitive ?? null,
  };

  const criticalFail =
    (report.build && !report.build.success) ||
    (report.tests && !report.tests.success) ||
    (report.dependencies && report.dependencies.hasTyposquat) ||
    (report.imports && report.imports.count > 0) ||
    (report.security && report.security.hasCritical);
  const warnings =
    (report.hallucinations && report.hallucinations.count > 0) ||
    (report.issue && report.issue.linkedIssue != null && !report.issue.addressed) ||
    (report.dependencies && report.dependencies.risks && report.dependencies.risks.length > 0) ||
    (report.scope && report.scope.unrelatedCount > 0) ||
    (report.security && report.security.findings && report.security.findings.length > 0) ||
    report.timeout != null ||
    (report.sensitive && (report.sensitive.critical?.length > 0 || report.sensitive.high?.length > 0 || (report.sensitive.presentInRepo && report.sensitive.presentInRepo.length > 0)));

  let verdict = 'READY';
  if (criticalFail) verdict = 'NOT_READY';
  else if (warnings) verdict = 'NEEDS_REVIEW';

  return { verdict, report };
}

/**
 * Formats the report as markdown for a GitHub PR comment.
 * @param {{ verdict: string, report: object }} report - From buildReport
 * @returns {string}
 */
function formatComment(report) {
  const { verdict, report: r } = report;
  const lines = [COMMENT_HEADER, '', '| Check | Result |', '|-------|--------|'];

  if (r.build !== null) {
    const status = r.build.success ? '✅ Passed' : '❌ Failed';
    lines.push(`| Build | ${status} |`);
  }
  if (r.tests !== null) {
    const status = r.tests.success
      ? `✅ Passed${r.tests.passing != null ? ` (${r.tests.passing} passing)` : ''}`
      : `❌ Failed${r.tests.failing != null ? ` (${r.tests.failing} failing)` : ''}`;
    lines.push(`| Tests | ${status} |`);
  }
  if (r.issue !== null && r.issue.linkedIssue != null) {
    const status = r.issue.addressed ? '✅ Addressed' : '❌ Not addressed';
    lines.push(`| Issue #${r.issue.linkedIssue} | ${status} |`);
  }
  if (r.hallucinations !== null) {
    const status =
      r.hallucinations.count === 0
        ? '✅ None'
        : `⚠️ ${r.hallucinations.count} found`;
    lines.push(`| Hallucinated APIs | ${status} |`);
  }
  if (r.dependencies !== null && r.dependencies.risks && r.dependencies.risks.length > 0) {
    const status = r.dependencies.hasTyposquat ? '❌ Risks (typosquat)' : `⚠️ ${r.dependencies.risks.length} risk(s)`;
    lines.push(`| Dependency risks | ${status} |`);
  }
  if (r.imports !== null && r.imports.count > 0) {
    lines.push(`| Hallucinated imports | ❌ ${r.imports.count} found |`);
  }
  if (r.scope !== null && r.scope.issueNumber != null) {
    const status = r.scope.unrelatedCount === 0 ? '✅ In scope' : `⚠️ ${r.scope.unrelatedCount} unrelated`;
    lines.push(`| PR scope (issue #${r.scope.issueNumber}) | ${status} |`);
  }
  if (r.security !== null && r.security.findings?.length > 0) {
    const status = r.security.hasCritical ? `❌ ${r.security.findings.length} (critical)` : `⚠️ ${r.security.findings.length}`;
    lines.push(`| Security scan | ${status} |`);
  }
  if (r.timeout != null) {
    lines.push(`| Execution timeout | ⚠️ ${r.timeout.step} |`);
  }
  if (r.sensitive != null && (r.sensitive.critical?.length > 0 || r.sensitive.high?.length > 0)) {
    const n = (r.sensitive.critical?.length || 0) + (r.sensitive.high?.length || 0);
    lines.push(`| Sensitive files | ⚠️ ${n} changed |`);
  }
  if (r.sensitive != null && r.sensitive.presentInRepo?.length > 0) {
    lines.push(`| Sensitive files in repo | ⚠️ ${r.sensitive.presentInRepo.length} present (e.g. .env) |`);
  }

  if (r.tests && !r.tests.success && r.tests.output) {
    lines.push('', '### ❌ Test failures', '');
    lines.push('```');
    lines.push(r.tests.output.slice(-2000).trim());
    lines.push('```');
  }
  if (r.issue && r.issue.linkedIssue != null && !r.issue.addressed && r.issue.reason) {
    lines.push('', `### ❌ Issue #${r.issue.linkedIssue}`, '', r.issue.reason);
  }
  if (r.hallucinations && r.hallucinations.count > 0 && r.hallucinations.list) {
    lines.push('', '### ⚠️ Hallucinated APIs', '');
    r.hallucinations.list.slice(0, 10).forEach((h) => {
      lines.push(`- \`${h.call}\` in ${h.file}:${h.line} — ${h.reason}`);
    });
  }
  if (r.dependencies && r.dependencies.risks && r.dependencies.risks.length > 0) {
    lines.push('', '### ⚠️ New dependency risks', '');
    r.dependencies.risks.slice(0, 10).forEach((d) => {
      const parts = [];
      if (d.typo) parts.push(`Possible typo of: **${d.typo.suggested}** (edit distance: ${d.typo.distance})`);
      if (d.age) parts.push(`Published ${d.age}`);
      if (d.downloads !== undefined) parts.push(`Only ${d.downloads} weekly downloads`);
      lines.push(`- **${d.name}** (${d.file})`);
      if (parts.length) lines.push('  ' + parts.join(' · '));
    });
  }
  if (r.imports && r.imports.count > 0 && r.imports.list) {
    lines.push('', '### ❌ Hallucinated imports', '');
    r.imports.list.slice(0, 10).forEach((h) => {
      const imp = h.export ? `import { ${h.export} } from "${h.module}"` : `require("${h.module}")`;
      lines.push(`- ${imp} — ${h.reason} (${h.file}:${h.line})`);
      if (h.available && h.available.length) lines.push(`  Available exports: ${h.available.join(', ')}`);
      if (h.suggested) lines.push(`  ${h.suggested}`);
    });
  }
  if (r.scope && r.scope.issueNumber != null && (r.scope.relevant.length > 0 || r.scope.possiblyRelated.length > 0 || r.scope.unrelated.length > 0)) {
    lines.push('', `### ⚠️ PR scope (issue #${r.scope.issueNumber})`, '');
    if (r.scope.issueTitle) lines.push(`**${r.scope.issueTitle}**`, '');
    if (r.scope.relevant.length > 0) {
      lines.push('✅ Relevant:', ...r.scope.relevant.slice(0, 15).map((f) => `   - ${f}`));
    }
    if (r.scope.possiblyRelated.length > 0) {
      lines.push('', '⚠️ Possibly unrelated:', ...r.scope.possiblyRelated.slice(0, 10).map((f) => `   - ${f}`));
    }
    if (r.scope.unrelated.length > 0) {
      lines.push('', '❌ Unrelated:', ...r.scope.unrelated.slice(0, 10).map((f) => `   - ${f}`));
      lines.push('', `This PR modifies ${r.scope.unrelatedCount} file(s) unrelated to the linked issue. Consider splitting.`);
    }
  }
  if (r.security && r.security.findings?.length > 0) {
    lines.push('', '### 🔒 Security scan', '');
    r.security.findings.slice(0, 15).forEach((f) => {
      lines.push(`- **${f.severity}** — ${f.file}:${f.line}: \`${f.snippet}\` — ${f.reason}`);
    });
  }
  if (r.timeout) {
    lines.push('', '### ⏱️ Execution timeout', '');
    lines.push(`**${r.timeout.step}** timed out.`);
    if (r.timeout.lastOutput) lines.push('', 'Last output:', '```', r.timeout.lastOutput.slice(-500), '```');
  }
  if (r.sensitive && (r.sensitive.critical?.length > 0 || r.sensitive.high?.length > 0 || r.sensitive.medium?.length > 0)) {
    lines.push('', '### 🔐 Sensitive files changed in this PR', '');
    if (r.sensitive.critical?.length > 0) {
      r.sensitive.critical.forEach(({ path: p, reason }) => lines.push(`- ❌ **CRITICAL** — \`${p}\`: ${reason}`));
    }
    if (r.sensitive.high?.length > 0) {
      r.sensitive.high.forEach(({ path: p, reason }) => lines.push(`- ⚠️ **HIGH** — \`${p}\`: ${reason}`));
    }
    if (r.sensitive.medium?.length > 0) {
      r.sensitive.medium.slice(0, 5).forEach(({ path: p, reason }) => lines.push(`- **MEDIUM** — \`${p}\`: ${reason}`));
    }
  }
  if (r.sensitive && r.sensitive.presentInRepo?.length > 0) {
    lines.push('', '### 🔐 Sensitive files present in repo', '');
    lines.push('These files exist in the repo (may have been added in a previous PR). Ensure they are not committed with secrets.', '');
    r.sensitive.presentInRepo.forEach(({ path: p, reason }) => lines.push(`- \`${p}\`: ${reason}`));
  }

  const verdictLabel =
    verdict === 'READY'
      ? '**✅ READY TO MERGE**'
      : verdict === 'NEEDS_REVIEW'
        ? '**⚠️ NEEDS REVIEW**'
        : '**❌ NOT READY TO MERGE**';
  lines.push('', '---', verdictLabel);

  return lines.join('\n');
}

/**
 * Finds an existing PRoof comment on the PR.
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @returns {Promise<number | null>} Comment ID or null
 */
async function findExistingComment(octokit, owner, repo, prNumber) {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });
  const proof = comments.find((c) => c.body && c.body.includes(COMMENT_HEADER));
  return proof ? proof.id : null;
}

/**
 * Posts or updates the PR comment with the formatted report.
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} owner
 * @param {string} repo
 * @param {number} prNumber
 * @param {string} commentBody - Markdown from formatComment
 * @returns {Promise<void>}
 */
async function postComment(octokit, owner, repo, prNumber, commentBody) {
  const existingId = await findExistingComment(octokit, owner, repo, prNumber);
  if (existingId) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existingId,
      body: commentBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: commentBody,
    });
  }
}

module.exports = {
  buildReport,
  formatComment,
  postComment,
  findExistingComment,
  COMMENT_HEADER,
};
