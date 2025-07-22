// vite.config.ts
import { defineConfig, PluginOption } from 'vite';
import vue from '@vitejs/plugin-vue';
import dts from 'unplugin-dts/vite';
import fs from 'node:fs';
import path from 'node:path';

const SRC = path.resolve('src');

// Collect adapter entry points that actually exist
const adapters = ['react', 'preact', 'vue', 'svelte']
  .filter((fw) => fs.existsSync(path.join(SRC, fw, 'index.ts')))
  .reduce((o, fw) => ({ ...o, [`${fw}/index`]: path.join(SRC, fw, 'index.ts') }), {});

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.json',
      /** Tell unplugin‑dts the same alias we give Vite */
      aliases: { '@embedpdf/plugin-rich-text': SRC },
    }) as PluginOption,
  ],
  /** ⬇️  let Vite/Rollup resolve the same alias at build time */
  resolve: {
    alias: { '@embedpdf/plugin-rich-text': SRC },
  },
  build: {
    lib: {
      entry: {
        index: path.join(SRC, 'index.ts'),
        ...adapters,
      },
      formats: ['es', 'cjs'],
      fileName: (format, entryName) => `${entryName}.${format === 'es' ? 'js' : 'cjs'}`,
    },
    sourcemap: true,
    rollupOptions: {
      output: { dir: 'dist' },
      external: [
        'vue',
        'react',
        'react/jsx-runtime',
        'preact',
        'preact/jsx-runtime',
        'preact/hooks',
        // everything else under @embedpdf/* lives in other workspace packages
        /^@embedpdf\//,
      ],
    },
  },
});
