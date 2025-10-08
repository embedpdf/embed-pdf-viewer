import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { glob } from 'glob';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: './tsconfig.lib.json',
      rollupTypes: false,
      entryRoot: 'src/examples',
      outDir: 'dist/examples',
      // Only include .vue files for type generation
      include: ['src/examples/**/*.vue'],
      beforeWriteFile: (filePath, content) => {
        // Rename .vue.d.ts to .d.ts
        if (filePath.endsWith('.vue.d.ts')) {
          return {
            filePath: filePath.replace('.vue.d.ts', '.d.ts'),
            content,
          };
        }
        return { filePath, content };
      },
    }),
  ],
  build: {
    outDir: 'dist/examples',
    sourcemap: true,
    emptyOutDir: true,
    lib: {
      // Use .ts files as entry points for bundling
      entry: Object.fromEntries(
        glob
          .sync('src/examples/*.ts')
          .map((file) => [
            path.relative('src/examples', file.slice(0, file.length - path.extname(file).length)),
            fileURLToPath(new URL(file, import.meta.url)),
          ]),
      ),
      formats: ['es'],
    },
    rollupOptions: {
      external: ['vue', /^@embedpdf\//],
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
});
