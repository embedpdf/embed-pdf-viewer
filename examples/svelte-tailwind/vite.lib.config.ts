import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { glob } from 'glob';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dts from 'vite-plugin-dts';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Compile to custom elements for easier embedding
        customElement: false,
      },
    }),
    dts({
      tsconfigPath: './tsconfig.lib.json',
      rollupTypes: false,
      entryRoot: 'src/examples',
      outDir: 'dist/examples',
      // Include .svelte files for type generation from subdirectories
      include: ['src/examples/**/*.svelte', 'src/examples/**/*.ts'],
      beforeWriteFile: (filePath, content) => {
        // Rename .svelte.d.ts to .d.ts
        if (filePath.endsWith('.svelte.d.ts')) {
          return {
            filePath: filePath.replace('.svelte.d.ts', '.d.ts'),
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
        if (/^svelte($|\/)/.test(id)) return true;
        if (/^@embedpdf\//.test(id) && !id.startsWith('@embedpdf/svelte-pdf-viewer')) return true;
        return false;
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: '[name].js',
      },
    },
  },
});
