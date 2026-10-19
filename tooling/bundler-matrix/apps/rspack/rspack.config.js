import path from 'node:path';
import { HtmlRspackPlugin } from '@rspack/core';

export default {
  entry: './src/main.js',
  output: {
    path: path.resolve('dist'),
    filename: '[name].[contenthash].js',
    publicPath: 'auto',
    clean: true,
    // Under Trusted Types the chunk loader sets each lazy chunk's script.src through a policy of
    // its own, which the page's `trusted-types` names (matrix.json).
    trustedTypes: 'rspack',
  },
  plugins: [new HtmlRspackPlugin({ template: './src/index.html' })],
};
