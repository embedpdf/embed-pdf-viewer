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
    // The two-door invariant, enforced (NAMING.md + packages/viewer/*/src/component.*).
    //
    // A framework wrapper's component module must stay ENGINE-BLIND: the local
    // PDFium engine enters a consumer's bundle through a runtime import of the
    // `.` door, and if that import sits in the shared component then BOTH doors
    // carry it and the cloud build's "no wasm" promise is silently gone. Types
    // are free — they vanish at compile time — so the boundary is exactly
    // `import type`.
    files: ['packages/viewer/*/src/component.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@embedpdf/viewer', '@embedpdf/viewer/*'],
              allowTypeImports: true,
              message:
                'component modules must stay engine-blind: use `import type` here, and put the ' +
                'side-effect import in the door entries (src/index.ts = local engine, ' +
                'src/core.ts = engine-agnostic). A runtime import here welds PDFium into both doors.',
            },
          ],
        },
      ],
    },
  },
  {
    // The CloudPDF tree renders server-side by definition — "no wasm in your
    // bundle" IS the product — so it must never reach for the local-engine
    // door. `@embedpdf/viewer` and `@embedpdf/viewer-<fw>` bundle PDFium;
    // their `/core` subpaths do not. (A bare `*` glob does not cross `/`, so
    // the `/core` doors stay allowed.)
    files: ['ee/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@embedpdf/viewer', '@embedpdf/viewer-*'],
              message:
                'the cloud tree must not bundle the local PDFium engine: import the ' +
                'engine-agnostic door instead (`@embedpdf/viewer/core`, ' +
                '`@embedpdf/viewer-react/core`, …) and inject cloudEngine().',
            },
          ],
        },
      ],
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
