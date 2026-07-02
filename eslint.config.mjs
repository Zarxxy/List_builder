import js from '@eslint/js';

const nodeGlobals = {
  require: 'readonly', module: 'readonly', exports: 'writable', __dirname: 'readonly', __filename: 'readonly',
  process: 'readonly', console: 'readonly', Buffer: 'readonly', global: 'readonly',
  setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
  fetch: 'readonly', AbortController: 'readonly', AbortSignal: 'readonly', URLSearchParams: 'readonly', URL: 'readonly',
  // DOM globals used inside crawler/sources/listhammer.js + tabletop-to.js page.evaluate() callbacks
  document: 'readonly', window: 'readonly', navigator: 'readonly',
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
    // Playwright e2e tests are ES modules and reference browser globals inside
    // page.evaluate() callbacks.
    files: ['tests/e2e/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...nodeGlobals, sessionStorage: 'readonly' },
    },
    rules: {
      'no-unused-vars': 'warn',
      'eqeqeq': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },
  {
    ignores: ['node_modules/', 'output/', 'public/', 'docs/'],
  },
];
