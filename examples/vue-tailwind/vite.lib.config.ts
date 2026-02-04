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
      // Include .vue files for type generation from subdirectories
      include: ['src/examples/**/*.vue', 'src/examples/**/*.ts'],
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
      // Use .ts files as entry points for bundling (now in subdirectories)
      entry: Object.fromEntries(
        glob
          .sync('src/examples/**/*.ts')
          .map((file) => [
            path.relative('src/examples', file.slice(0, file.length - path.extname(file).length)),
            fileURLToPath(new URL(file, import.meta.url)),
          ]),
      ),
      formats: ['es'],
    },
    rollupOptions: {
      external: (id: string) => {
        if (/^vue($|\/)/.test(id)) return true;
        if (/^@embedpdf\//.test(id) && !id.startsWith('@embedpdf/vue-pdf-viewer')) return true;
        return false;
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
});
