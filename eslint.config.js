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
    // Plugin sources stay readable one file at a time: a concern is a folder,
    // a file is one area of it. Types-only entries and tests are exempt.
    files: ['packages/plugin/*/src/**/*.ts'],
    ignores: ['**/contract.ts', '**/host-contract.ts', '**/*.test.ts'],
    rules: {
      'max-lines': ['warn', { max: 400, skipBlankLines: true, skipComments: true }],
    },
  },
  {
    // Names say what a value is (docs/conventions/naming.md): no single
    // letters beyond loop counters, coordinates, ignored parameters and the
    // translate function, and none of the abbreviations the glossary retires.
    files: [
      'packages/{core,plugin,framework,viewer}/*/src/**/*.{ts,tsx}',
      'packages/framework/angular/*/src/**/*.ts',
    ],
    rules: {
      'id-length': [
        'error',
        {
          min: 2,
          properties: 'never',
          exceptions: ['i', 'j', 'x', 'y', '_', 't'],
          exceptionPatterns: ['^[TKV]$'],
        },
      ],
      'id-denylist': [
        'error',
        'pon',
        'pons',
        'opts',
        'cfg',
        'err',
        'evt',
        'ev',
        'prev',
        'cur',
        'idx',
        'res',
        'req',
        'cb',
        'tmp',
        'cap',
        'def',
        'sel',
        'ptr',
        'pts',
        'bin',
        'el',
        'msg',
        'annot',
        'geom',
        'rawCtx',
      ],
    },
  },
  {
    // A PDF transform matrix is `[a b c d e f]` in the specification; the
    // matrix helpers keep those entry names so the math reads like the spec.
    files: ['packages/core/geometry/src/index.ts'],
    rules: {
      'id-length': [
        'error',
        {
          min: 2,
          properties: 'never',
          exceptions: ['i', 'j', 'x', 'y', '_', 't', 'a', 'b', 'c', 'd', 'e', 'f'],
          exceptionPatterns: ['^[TKV]$'],
        },
      ],
    },
  },
  {
    // Inside a plugin, events and write queues come from the context, so the
    // kernel owns their lifetime (docs/conventions/plugins.md).
    files: ['packages/plugin/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@embedpdf/core',
              importNames: ['createEventHook', 'createSerialQueue'],
              message: 'Use ctx.events.source() / ctx.serialQueue() inside plugins.',
            },
          ],
        },
      ],
    },
  },
  {
    // The two-door invariant, enforced (docs/conventions/packages.md and
    // packages/viewer/*/src/component.*).
    //
    // A framework wrapper's component module must stay engine-blind: the local
    // PDFium engine enters a consumer's bundle through a runtime import of the
    // `.` door, and if that import sits in the shared component then both doors
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
    // bundle" is the product — so it must never reach for the local-engine
    // door. `@embedpdf/viewer` and `@embedpdf/viewer-<fw>` bundle PDFium;
    // their `/core` subpaths do not. (A bare `*` glob does not cross `/`, so
    // the `/core` doors stay allowed.)
    files: ['cloudpdf/**/*.{ts,tsx}'],
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
