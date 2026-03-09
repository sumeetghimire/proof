/**
 * PR scope check: classify changed files as relevant, possibly related, or unrelated to the linked issue.
 */

const { getChangedFilesFromDiff, extractKeywords } = require('./issue.js');

const POSSIBLY_RELATED_NAMES = ['readme', 'readme.md', 'changelog', 'docs', 'doc', '.md', 'license'];

/**
 * Classifies changed files by relevance to the issue (keyword + path heuristics).
 * @param {{ title: string, body: string }} issue - Fetched issue
 * @param {string} diff - PR diff
 * @param {number} [issueNumber] - Linked issue number for the report
 * @returns {{ issueTitle: string, issueNumber: number | null, relevant: string[], possiblyRelated: string[], unrelated: string[], unrelatedCount: number }}
 */
function checkScope(issue, diff, issueNumber = null) {
  const files = getChangedFilesFromDiff(diff);
  const issueText = `${issue.title || ''} ${issue.body || ''}`;
  const keywords = extractKeywords(issueText).filter((w) => w.length >= 3);
  const titleLower = (issue.title || '').toLowerCase();
  const relevant = [];
  const possiblyRelated = [];
  const unrelated = [];

  for (const file of files) {
    const pathLower = file.toLowerCase();
    const matchCount = keywords.filter((k) => pathLower.includes(k)).length;
    const titleInPath = titleLower.length >= 5 && pathLower.includes(titleLower.slice(0, Math.min(20, titleLower.length)));

    if (matchCount >= 2 || titleInPath) {
      relevant.push(file);
    } else if (matchCount === 1 || POSSIBLY_RELATED_NAMES.some((n) => pathLower.includes(n))) {
      possiblyRelated.push(file);
    } else {
      unrelated.push(file);
    }
  }

  return {
    issueTitle: issue.title || '',
    issueNumber,
    relevant,
    possiblyRelated,
    unrelated,
    unrelatedCount: unrelated.length,
  };
}

module.exports = {
  checkScope,
};
