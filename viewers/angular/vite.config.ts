import angular from '@analogjs/vite-plugin-angular'
import { resolve } from 'path'
import dts from 'unplugin-dts/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    mainFields: ['module'],
  },
  plugins: [
    ...angular({
      tsconfig: resolve(__dirname, 'tsconfig.json'),
    }),
    dts({
      tsconfigPath: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  build: {
    target: ['esnext'],
    sourcemap: true,
    minify: false,
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'js' : 'cjs'}`,
    },
    rollupOptions: {
      external: [/^@angular($|\/)/, /^rxjs($|\/)/, 'tslib', /^@embedpdf\//],
      output: {
        preserveModules: false,
      },
    },
  },
})
