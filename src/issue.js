/**
 * Issue linkage: detect linked issue from PR body/title and check if the PR addresses it.
 * Pure text/keyword and file-path analysis, no LLM.
 */

const LINK_PATTERNS = [
  /\b(?:fixes?|closed?|resolves?)\s*#(\d+)/gi,
  /\b(?:fixes?|closed?|resolves?)\s+https?:\/\/[^\s]+\/(?:issues|pull)\/(\d+)/gi,
  /#(\d+)/g,
];

/**
 * Extracts a linked issue number from PR title and body (e.g. "Fixes #42", "Closes #123").
 * @param {string} prBody - PR description
 * @param {string} prTitle - PR title
 * @returns {number | null} Issue number or null
 */
function extractLinkedIssue(prBody, prTitle) {
  const text = [prTitle, prBody].filter(Boolean).join('\n');
  for (const re of LINK_PATTERNS) {
    const m = re.exec(text);
    if (m) return parseInt(m[1], 10);
  }
  return null;
}

/**
 * Fetches issue title and body from the GitHub API.
 * @param {import('@octokit/rest').Octokit} octokit
 * @param {string} owner - Repo owner
 * @param {string} repo - Repo name
 * @param {number} issueNumber
 * @returns {Promise<{ title: string, body: string } | null>}
 */
async function fetchIssue(octokit, owner, repo, issueNumber) {
  try {
    const { data } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });
    return {
      title: data.title || '',
      body: data.body || '',
    };
  } catch {
    return null;
  }
}

/**
 * Extracts changed file paths from a raw diff.
 * @param {string} diff
 * @returns {string[]}
 */
function getChangedFilesFromDiff(diff) {
  const files = [];
  const re = /^diff --git a\/.+? b\/(.+)$/gm;
  let m;
  while ((m = re.exec(diff)) !== null) files.push(m[1]);
  return files;
}

/**
 * Extracts significant words (alphanumeric, length >= 2) from text for matching.
 * @param {string} text
 * @returns {string[]}
 */
function extractKeywords(text) {
  if (!text || typeof text !== 'string') return [];
  const words = text.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter((w) => w.length >= 2);
  return [...new Set(words)];
}

/**
 * Checks whether the PR changes appear to address the linked issue (keyword + file path heuristics).
 * @param {{ title: string, body: string }} issue - Fetched issue
 * @param {string} diff - PR diff
 * @param {string[]} [changedFiles] - Optional; derived from diff if not provided
 * @param {number} [linkedIssue] - Issue number for the result
 * @returns {{ addressed: boolean, confidence: 'HIGH'|'MEDIUM'|'LOW', reason: string, linkedIssue: number | null }}
 */
function checkIssueAddressed(issue, diff, changedFiles = null, linkedIssue = null) {
  const files = changedFiles || getChangedFilesFromDiff(diff);
  const issueText = `${issue.title} ${issue.body}`.toLowerCase();
  const diffLower = diff.toLowerCase();
  const keywords = extractKeywords(issueText).filter((w) => w.length >= 3);
  const filePaths = files.join(' ').toLowerCase();

  let score = 0;
  const reasons = [];

  if (keywords.length > 0) {
    const matchCount = keywords.filter((k) => diffLower.includes(k) || filePaths.includes(k)).length;
    const ratio = matchCount / keywords.length;
    if (ratio >= 0.5) {
      score += 2;
      reasons.push('diff or changed files contain terms from the issue');
    } else if (ratio >= 0.2) {
      score += 1;
      reasons.push('some issue terms appear in the diff or files');
    } else {
      reasons.push('few or no issue terms found in the diff or changed files');
    }
  } else {
    reasons.push('issue has no clear keywords to match');
  }

  if (issue.title && diffLower.includes(issue.title.toLowerCase().slice(0, 30))) {
    score += 2;
    reasons.push('issue title appears in the diff');
  }

  const addressed = score >= 2;
  const confidence = score >= 3 ? 'HIGH' : score >= 2 ? 'MEDIUM' : 'LOW';
  const reason = reasons.length ? reasons.join('; ') : 'could not determine';

  return {
    addressed,
    confidence,
    reason,
    linkedIssue: linkedIssue ?? null,
  };
}

module.exports = {
  extractLinkedIssue,
  fetchIssue,
  checkIssueAddressed,
  getChangedFilesFromDiff,
  extractKeywords,
};
