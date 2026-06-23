const rootConfig = require('../../eslint.config.js');

/** @type {import("eslint").Linter.FlatConfig[]} */
module.exports = [
  ...rootConfig,
  {
    files: ['**/*.ts', '**/*.tsx'],
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
    },
  },
];
