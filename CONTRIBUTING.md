# Contributing to PRoof

Thanks for your interest in contributing.

## Development setup

```bash
git clone https://github.com/sumeetghimire/proof.git
cd proof
npm install
npm run build
```

## Running tests

```bash
# All tests (some require Docker for integration tests)
node --test test/*.test.js

# Unit tests only (no Docker, exits quickly)
node --test test/detector.test.js
node --test test/issue.test.js
node --test test/reporter.test.js
node --test test/runner-parse.test.js
node --test test/hallucination.test.js
```

## Code style

- Use async/await; avoid callbacks.
- Add a JSDoc comment above every exported function.
- Keep files under ~150 lines; split if larger.
- No hardcoded secrets or tokens.

## Submitting changes

1. Open an issue or pick an existing one.
2. Fork the repo, create a branch, make your changes.
3. Run `npm run build` and ensure tests pass.
4. Open a pull request with a clear description and reference to the issue.

By contributing, you agree that your contributions will be licensed under the MIT License.
