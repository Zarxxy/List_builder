import js from '@eslint/js';

const nodeGlobals = {
  require: 'readonly', module: 'readonly', exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
  process: 'readonly', console: 'readonly', Buffer: 'readonly', global: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  fetch: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly', URLSearchParams: 'readonly', URL: 'readonly',
};

const browserGlobals = {
  document: 'readonly', window: 'readonly', navigator: 'readonly', console: 'readonly',
  fetch: 'readonly', sessionStorage: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', AbortController: 'readonly',
};

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'commonjs', globals: nodeGlobals },
    rules: {
      'no-unused-vars': 'warn',
      'eqeqeq': 'error',
      'no-console': 'off',
      'no-empty': ['error', { allowEmptyCatch: true }],
      'no-irregular-whitespace': ['error', { skipRegExps: true }],
    },
  },
  {
    // Browser page scripts (public/app.js is served as-is; docs/index.app.js
    // is inlined into the generated docs page by build-pages.js). Shared
    // helpers arrive as script-scope globals — declared via /* global */
    // comments at the top of each file.
    files: ['public/app.js', 'docs/index.app.js'],
    languageOptions: { ecmaVersion: 2022, sourceType: 'script', globals: browserGlobals },
    rules: {
      'no-unused-vars': 'warn',
      'eqeqeq': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    // Playwright e2e tests are ES modules and reference browser globals inside
    // page.evaluate() callbacks.
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...nodeGlobals, ...browserGlobals },
    },
    rules: {
      'no-unused-vars': 'warn',
      'eqeqeq': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ['node_modules/', 'output/', 'docs/index.html'],
  },
];
