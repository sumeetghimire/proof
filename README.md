# PRoof

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**PRoof** is an open source GitHub Action that verifies pull requests actually fix what they claim to fix. It runs the build and tests on the GitHub Actions runner, checks whether the PR addresses the linked issue, detects hallucinated (non-existent) API calls, scans for security patterns and sensitive file changes, and enforces execution timeouts—with **no LLM and no API keys**.

## The problem it solves

Tools like CodeRabbit, PR-Agent, and DiffGuard send the diff to an LLM and post review comments. They don't run the code, don't confirm tests pass, and don't verify the PR fixes the linked issue. **PRoof** runs the repo on the runner, runs the test suite, checks issue linkage with simple text analysis, and validates that added API calls exist—all without any external API.

---

## Installation

### Option 1: Install with npx (recommended)

From your repo root (must be a git repo):

```bash
npx @sumeetghimire/proof-cli init
```

Answer the prompts (block merge, run tests, check issue, etc.). The CLI creates `.github/workflows/proof.yml` for you. Then:

```bash
git add .github/workflows/proof.yml
git commit -m "Add PRoof verification"
git push
```

**That's it.** From now on, every pull request will trigger PRoof on GitHub. You don't run anything locally—when someone opens a PR or pushes to a PR branch, GitHub runs the workflow and PRoof posts a verification report as a comment on the PR.

### Option 2: Add the workflow file manually

Create `.github/workflows/proof.yml` in your repo:

```yaml
name: PRoof
on: [pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    permissions:
      pull-requests: write
      contents: read
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: sumeetghimire/proof@1.0.1
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          run_tests: true
          check_issue: true
          detect_hallucinations: true
          block_merge: false
```

Commit and push. PRoof runs automatically on every pull request; no local run needed.

---

## How it runs

- **When:** Every time a pull request is opened or updated (push to the PR branch).
- **Where:** On GitHub Actions (the workflow runs on GitHub’s runners). The action uses `GITHUB_WORKSPACE`—the checked-out PR branch—as the working directory for all commands.
- **What you do:** Nothing. Open or update a PR; the workflow runs and PRoof posts (or updates) a single comment with the verification report.

---

## How it works (technical)

PRoof runs as a single Node.js process on the runner. It reads inputs and PR context, fetches the PR diff once from the GitHub API, then runs a series of **diff-based checks** (no code execution) and, if the repo language is supported, an **execution phase** (install, build, test). Finally it builds a report, formats it as Markdown, and posts or updates one comment on the PR.

### 1. Context and diff

- **PR context** comes from `github.context.payload` (pull request number, title, body, head/base refs, repo owner/name).
- **PR diff** is fetched with `pulls.get` and `mediaType: { format: 'diff' }`. Only the **unified diff** (added/removed lines per file) is used. This diff is reused for: dependency changes, import/API usage, security patterns, sensitive files, issue linkage, scope, and (for Node) hallucination input.

### 2. Language and build-system detection

- **Language** is detected by the presence of config files in the repo root, in a fixed order (first match wins):  
  `package.json` → Node, `go.mod` → Go, `composer.json` → PHP, `Gemfile` → Ruby, `Cargo.toml` → Rust, `requirements.txt` / `setup.py` / `pyproject.toml` → Python.  
  If none are found, the repo is treated as unsupported and no install/build/test commands are run.
- **Build system** is derived from the detected language:
  - **Node:** `package.json` scripts and devDependencies → `npm install`, optional `npm run build`, `npm test` or `npm run test`.
  - **Python:** `pip install -r requirements.txt` (or `pip install .`), `python -m pytest -v` (no fixed path; pytest discovers tests).
  - **Go / PHP / Ruby / Rust:** fixed install and test commands (e.g. `go mod download`, `go test ./...`, `composer install`, `vendor/bin/phpunit`, etc.).

### 3. Diff-based checks (no execution)

These run only on the PR diff; they do not run install or execute repo code.

- **Dependency risk:** New dependency lines in `package.json`, `requirements.txt`, or `composer.json` are parsed from the diff. For each new package, PRoof checks typosquatting (e.g. Levenshtein distance to known names), package age (npm/PyPI API), and download count. Typosquatting or critical age/count issues can make the verdict **NOT_READY**.
- **Import/API validation:** Added lines are scanned for `import`/`require` and named exports. PRoof checks that the resolved module and export exist (e.g. in `node_modules` or site-packages). Invalid or hallucinated imports are reported and can make the verdict **NOT_READY**.
- **Security scan:** Only **added** lines in the diff are scanned with regex patterns:
  - **Critical:** `eval(`, `child_process.exec`/`execSync`/`spawn`, `os.system`/`subprocess.call` (Python), `shell_exec`/`system` (PHP).
  - **High:** Hardcoded secrets (e.g. `apiKey = "..."`, `sk-...`, AWS/GitHub token patterns), `process.env[...] =`, `__import__(` (Python).
  - **Medium:** `innerHTML =`, `document.write`, `dangerouslySetInnerHTML`, `pickle.loads` (Python), `unserialize` (PHP).
  - **Low:** `console.log` with concatenation, `TODO`/`FIXME`, `debugger;`.  
  Any **critical** finding sets the verdict to **NOT_READY**.
- **Sensitive files:** Changed file paths from the diff are matched against patterns (e.g. `.github/workflows/`, `Dockerfile`, `.env`, `**/secrets/**`, `package.json`, deploy scripts, certs). Findings are reported as critical/high/medium; they contribute to **NEEDS_REVIEW** but do not by themselves set **NOT_READY**.

### 4. Execution phase (install, build, test)

Only if a language was detected and `run_tests` is true:

- **Install:** The build system’s install command (e.g. `npm install`, `pip install -r requirements.txt`) is run in `GITHUB_WORKSPACE` via `@actions/exec` (`sh -c` in that directory). It is wrapped in a **timeout** (`build_timeout` seconds). If it times out or fails, the result is recorded and the rest of the execution phase can be skipped or failed.
- **Build:** If the build system has a build command (e.g. `npm run build`), it is run in the workspace with the same timeout. Success/failure and duration are stored.
- **Test:** The test command (e.g. `npm test`, `python -m pytest -v`) is run in the workspace with a separate **timeout** (`test_timeout` seconds). Stdout/stderr and exit code are captured. Output is parsed heuristically to infer passing/failing test counts when possible. Test failure sets **NOT_READY**.

All commands run in the same runner environment; there is no separate container. The “sandbox” is the GitHub Actions job and the workspace directory.

### 5. Issue linkage and scope

- **Linked issue:** The PR title and body are searched for patterns like `Fixes #42`, `Closes #123`, `Resolves #N`, or `#N`. The first matching issue number is used. That issue is fetched with `issues.get` (title + body). No LLM is used.
- **Addressed or not:** Keywords are extracted from the issue title and body (lowercased, alphanumeric, length ≥ 2). The diff and changed file paths are then checked for overlap with those keywords. If there is sufficient overlap, the PR is considered to “address” the issue (with a simple confidence); otherwise it is reported as not addressed. That result can push the verdict to **NEEDS_REVIEW**.
- **Scope:** If an issue is linked and scope check is enabled, changed files are classified as relevant, possibly related, or unrelated to the issue (again by keyword/path matching). A count of “unrelated” files is reported and can contribute to **NEEDS_REVIEW**.

### 6. Hallucinated API detection (Node only)

- Only **JavaScript/TypeScript** files (e.g. `.js`, `.mjs`, `.ts`, `.tsx`) in the **added** lines of the diff are considered.
- Added JS/TS snippets are parsed with **acorn** (ECMAScript). The AST is walked for `CallExpression` nodes; for each call, the “object” and “method” (e.g. `fs.readFileSync`) are extracted.
- For **Node** repos, each such call is validated by running a small Node one-liner in the workspace that `require`s the module and checks `typeof m[method]`. If the method does not exist or is not a function, the call is reported as a hallucinated API. Any hallucinated import/call can set the verdict to **NOT_READY**. For non-Node repos, this step is skipped (no AST parsing of Python/PHP etc. for “API” hallucination in this action).

### 7. Report and comment

- **Verdict** is computed from all results:  
  **NOT_READY** if any of: build failed, tests failed, dependency typosquatting, hallucinated imports, or critical security finding.  
  **NEEDS_REVIEW** if there are warnings (e.g. hallucinated APIs, issue not addressed, scope unrelated, non-critical security, timeout, sensitive files) but no NOT_READY condition.  
  **READY** otherwise.
- The report is turned into a **Markdown** comment (table of checks + optional detail sections). The action uses the GitHub API to **list comments** on the PR, find an existing comment that starts with the same PRoof header, and **update** it; otherwise it **creates** a new comment. So there is at most one PRoof comment per PR, updated on every run.
- If `block_merge` is true and the verdict is **NOT_READY**, the action calls `core.setFailed(...)` so the workflow step fails and the check does not pass (merge can be blocked by branch protection).

### Summary flow

```
PR event → read inputs + payload
         → fetch PR diff (GitHub API)
         → diff-only checks: dependencies, imports, security, sensitive files
         → detect language + build system
         → (if run_tests) install → build → test (with timeouts, in GITHUB_WORKSPACE)
         → (if Node + detect_hallucinations) parse JS in diff, validate API calls in workspace
         → (if check_issue) extract issue #, fetch issue, check addressed + scope
         → buildReport() → formatComment() → postComment()
         → optional setFailed() if block_merge && NOT_READY
```

---

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `github_token` | Yes | — | GitHub token for API (use `secrets.GITHUB_TOKEN`) |
| `run_tests` | No | `true` | Run the test suite on the runner |
| `check_issue` | No | `true` | Check whether the PR addresses the linked issue (e.g. "Fixes #42") |
| `detect_hallucinations` | No | `true` | Check for non-existent API calls in the diff (Node.js) |
| `block_merge` | No | `false` | If `true`, fail the check when verification is NOT_READY (blocks merge) |
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
- uses: sumeetghimire/proof@1.0.1
  with:
    github_token: ${{ secrets.GITHUB_TOKEN }}
    run_tests: true
    check_issue: true
    detect_hallucinations: true
    block_merge: true   # block merge when checks fail
```

---

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

If something fails or there are warnings (e.g. hallucinated APIs, issue not addressed, security findings), the table and verdict reflect that, and optional detail sections list the findings.

---

## Build (for action maintainers)

To work on the action itself: `npm install` and `npm run build` to produce `dist/index.js`. Commit `dist/index.js` when cutting a release so that `sumeetghimire/proof@<tag>` works for users.

---

## License

MIT
