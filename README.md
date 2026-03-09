# PRoof

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**PRoof** is an open source GitHub Action that verifies pull requests actually fix what they claim to fix. It runs the build and tests on the GitHub Actions runner, checks whether the PR addresses the linked issue, detects hallucinated (non-existent) API calls, scans for security patterns and sensitive file changes, and enforces execution timeouts—with **no LLM and no API keys**.

## The problem it solves

Tools like CodeRabbit, PR-Agent, and DiffGuard send the diff to an LLM and post review comments. They don’t run the code, don’t confirm tests pass, and don’t verify the PR fixes the linked issue. **PRoof** runs the repo on the runner, runs the test suite, checks issue linkage with simple text analysis, and validates that added API calls exist—all without any external API.

## Installation

Add one workflow file. No API keys, no accounts, no config.

Create `.github/workflows/proof.yml` in your repo:

```yaml
name: PRoof
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: sumeetghimire/proof@v1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          run_tests: true
          check_issue: true
          detect_hallucinations: true
          block_merge: false
```

That’s it. PRoof will run on every pull request and post a verification report as a comment.

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github_token` | Yes | — | GitHub token for API (use `secrets.GITHUB_TOKEN`) |
| `run_tests` | No | `true` | Run the test suite on the runner |
| `check_issue` | No | `true` | Check whether the PR addresses the linked issue (e.g. "Fixes #42") |
| `detect_hallucinations` | No | `true` | Check for non-existent API calls in the diff |
| `block_merge` | No | `false` | If `true`, fail the check when verification is NOT READY (blocks merge) |
| `check_dependencies` | No | `true` | Check new dependencies for typosquatting, age, and download count |
| `check_imports` | No | `true` | Validate import/require and named exports exist in installed packages |
| `check_scope` | No | `true` | Check if changed files are relevant to the linked issue |
| `security_scan` | No | `true` | Scan added diff lines for dangerous code patterns (eval, secrets, XSS, etc.) |
| `build_timeout` | No | `120` | Seconds before build/install step is killed |
| `test_timeout` | No | `300` | Seconds before test suite is killed |
| `check_sensitive_files` | No | `true` | Warn when CI/CD, Docker, secrets, or deployment files are modified |
| `languages` | No | *(auto)* | Comma-separated languages; leave empty for auto-detect |

### Example with options

```yaml
- uses: sumeetghimire/proof@v1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    run_tests: true
    check_issue: true
    detect_hallucinations: true
    block_merge: true   # block merge when checks fail
```

## Example output

PRoof posts (or updates) a single comment on the PR with a report like:

```markdown
## PRoof Verification Report

| Check | Result |
|-------|--------|
| Build | ✅ Passed |
| Tests | ✅ Passed (5 passing) |
| Issue #42 | ✅ Addressed |
| Hallucinated APIs | ✅ None |

---
**✅ READY TO MERGE**
```

If something fails or there are warnings (e.g. hallucinated APIs, issue not addressed), the table and verdict reflect that.

## Build (for maintainers)

The action runs from the bundled file. Build before running the action or testing with act:

```bash
npm install
npm run build
```

This produces `dist/index.js`. Use `npm run run:local` to run from source without building.

## Run locally

```bash
npm install
npm run run:local
```

This runs the full flow (detector, install/build/tests on the runner, etc.). Set `INPUT_RUN_TESTS=false` to skip running tests.

## Run with act

1. Install act: `brew install act`
2. Ensure Docker is running and the project is a git repo (`git init` if needed).
3. Build: `npm run build`
4. Run: `act pull_request -e test/mock-pr.json --secret GITHUB_TOKEN=test`

On Apple Silicon, you may need: `--container-architecture linux/amd64` or pull the runner image first. No Docker is required for PRoof itself; it uses the runner as the execution environment.

## Publishing to GitHub Marketplace

1. Ensure the repo is public and has `action.yml` at the root with a unique `name`.
2. Run `npm run build` and **commit the `dist/` folder** (or remove `dist/` from `.gitignore` for the release).
3. Create a new release (e.g. tag `v1`) and check **Publish this Action to the GitHub Marketplace**.
4. Accept the Marketplace Developer Agreement and complete the listing (categories, description).

After that, users can reference `sumeetghimire/proof@v1` (or your tag) in their workflows.

## License

MIT
