import { defineConfig } from 'vite';
import { resolve } from 'path';
import vue from '@vitejs/plugin-vue';
import dts from 'unplugin-dts/vite';

export default defineConfig({
  plugins: [
    vue(),
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['vue', /^@embedpdf\//],
    },
    sourcemap: true,
    minify: 'terser',
  },
});
