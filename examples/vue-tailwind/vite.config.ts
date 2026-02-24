import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [vue(), tailwindcss()],
  server: {
    port: 3000,
    open: true,
    cors: true,
  },
  preview: {
    port: 3000,
    cors: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'esnext',
    minify: false,
    cssCodeSplit: false,
  },
  optimizeDeps: {
    exclude: ['@embedpdf/engines'],
  },
});
