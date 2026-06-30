import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    rules: {
      'no-unused-vars': 'warn',
      'eqeqeq': 'error',
      'no-console': 'off',
    },
  },
  {
    ignores: ['node_modules/', 'output/', 'public/', 'docs/'],
  },
];
