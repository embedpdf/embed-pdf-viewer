const path = require('node:path');

const eslintPluginPrettier = require('eslint-plugin-prettier');
const js = require('@eslint/js');
const ts = require('@typescript-eslint/eslint-plugin');
const tsParser = require('@typescript-eslint/parser');
const importPlugin = require('eslint-plugin-import');
const nextPlugin = require('@next/eslint-plugin-next');

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  {
    // Framework samples are compiled by their dedicated tsconfig files in the
    // website check:samples script, not the root type-aware ESLint project.
    ignores: ['node_modules', 'dist', 'build', '.turbo', 'website/src/samples/**'],
  },
  {
    plugins: {
      '@next/next': nextPlugin,
    },
  },
  js.configs.recommended,
  {
    files: ['**/types.ts', '**/types/*.ts', '**/*.d.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: './tsconfig.json',
      },
    },
    plugins: {
      '@typescript-eslint': ts,
      prettier: eslintPluginPrettier,
      import: importPlugin,
    },
    rules: {
      'prettier/prettier': 'error',
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
      'import/order': [
        'warn',
        {
          groups: ['builtin', 'external', 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'spaced-comment': ['error', 'always', { markers: ['/'] }],
    },
  },
  {
    files: ['website/**/*.{js,jsx,ts,tsx}'],
    settings: {
      next: {
        rootDir: path.join(__dirname, 'website'),
      },
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
