/**
 * Language and build-system detection for the repository.
 * Used to choose install/build/test commands for the runner.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Checks if a file exists at the given path.
 * @param {string} repoPath - Repository root
 * @param {string} relativePath - Path relative to repo root
 * @returns {Promise<boolean>}
 */
async function fileExists(repoPath, relativePath) {
  try {
    await fs.access(path.join(repoPath, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Detects the primary language of the repository from config files.
 * @param {string} repoPath - Absolute path to repository root
 * @returns {Promise<{ language: string, version?: string } | null>} Language and optional version, or null if unknown
 */
async function detectLanguage(repoPath) {
  if (await fileExists(repoPath, 'package.json')) return { language: 'node', version: '18' };
  if (await fileExists(repoPath, 'go.mod')) return { language: 'go', version: '1.21' };
  if (await fileExists(repoPath, 'composer.json')) return { language: 'php', version: '8.2' };
  if (await fileExists(repoPath, 'Gemfile')) return { language: 'ruby', version: '3' };
  if (await fileExists(repoPath, 'Cargo.toml')) return { language: 'rust', version: '1' };
  if (await fileExists(repoPath, 'requirements.txt')) return { language: 'python', version: '3.11' };
  if (await fileExists(repoPath, 'setup.py')) return { language: 'python', version: '3.11' };
  if (await fileExists(repoPath, 'pyproject.toml')) return { language: 'python', version: '3.11' };
  return null;
}

/**
 * Reads package.json and returns parsed object or null.
 * @param {string} repoPath - Repository root
 * @returns {Promise<object | null>}
 */
async function readPackageJson(repoPath) {
  try {
    const raw = await fs.readFile(path.join(repoPath, 'package.json'), 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Detects build and test commands for the given language.
 * @param {string} repoPath - Repository root
 * @param {{ language: string, version?: string }} lang - Result from detectLanguage
 * @returns {Promise<{ buildCommand: string | null, testCommand: string, installCommand: string }>}
 */
async function detectBuildSystem(repoPath, lang) {
  if (lang.language === 'node') {
    const pkg = await readPackageJson(repoPath);
    const scripts = pkg?.scripts || {};
    const devDeps = pkg?.devDependencies || {};
    const testCommand = scripts.test ? 'npm test' : 'npm run test';
    const buildCommand = scripts.build ? 'npm run build' : null;
    const installCommand = 'npm install';
    return { buildCommand, testCommand, installCommand };
  }

  if (lang.language === 'python') {
    const hasRequirements = await fileExists(repoPath, 'requirements.txt');
    const installCommand = hasRequirements ? 'pip install -r requirements.txt' : 'pip install .';
    return {
      buildCommand: null,
      testCommand: 'python -m pytest tests/ -v',
      installCommand,
    };
  }

  if (lang.language === 'php') {
    return {
      buildCommand: null,
      testCommand: 'vendor/bin/phpunit',
      installCommand: 'composer install',
    };
  }

  if (lang.language === 'go') {
    return {
      buildCommand: 'go build ./...',
      testCommand: 'go test ./...',
      installCommand: 'go mod download',
    };
  }

  if (lang.language === 'ruby') {
    return {
      buildCommand: null,
      testCommand: 'bundle exec rake test',
      installCommand: 'bundle install',
    };
  }

  if (lang.language === 'rust') {
    return {
      buildCommand: 'cargo build',
      testCommand: 'cargo test',
      installCommand: null,
    };
  }

  return {
    buildCommand: null,
    testCommand: '',
    installCommand: '',
  };
}

module.exports = {
  detectLanguage,
  detectBuildSystem,
  fileExists,
  readPackageJson,
};
