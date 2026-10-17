import path from 'node:path';
import HtmlWebpackPlugin from 'html-webpack-plugin';

export default {
  entry: './src/main.js',
  output: {
    path: path.resolve('dist'),
    filename: '[name].[contenthash].js',
    publicPath: 'auto',
    clean: true,
    // Under Trusted Types the chunk loader sets each lazy chunk's script.src through a policy of
    // its own, which the page's `trusted-types` names (matrix.json).
    trustedTypes: 'webpack',
  },
  plugins: [new HtmlWebpackPlugin({ template: './src/index.html' })],
};
