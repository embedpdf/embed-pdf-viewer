import { defineConfig } from 'vite';
import { resolve } from 'path';
import dts from 'unplugin-dts/vite';

export default defineConfig({
  plugins: [
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  esbuild: {
    jsx: 'automatic',
  },
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.tsx'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: ['react', 'react-dom', 'react/jsx-runtime', /^@embedpdf\//],
    },
    sourcemap: true,
    minify: 'terser',
  },
});
