import path from 'node:path';
import { HtmlRspackPlugin } from '@rspack/core';

export default {
  entry: './src/main.js',
  output: {
    path: path.resolve('dist'),
    filename: '[name].[contenthash].js',
    publicPath: 'auto',
    clean: true,
  },
  plugins: [new HtmlRspackPlugin({ template: './src/index.html' })],
};
