import path from 'node:path';
import HtmlWebpackPlugin from 'html-webpack-plugin';

export default {
  entry: './src/main.js',
  output: {
    path: path.resolve('dist'),
    filename: '[name].[contenthash].js',
    publicPath: 'auto',
    clean: true,
  },
  plugins: [new HtmlWebpackPlugin({ template: './src/index.html' })],
};
