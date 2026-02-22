import { defineConfig } from 'vite';
import { createConfig } from '@embedpdf/build/vite';

export default defineConfig(() => {
  return createConfig({
    tsconfigPath: './tsconfig.json',
    entryPath: {
      index: 'index.ts',
      'web/index': 'web/index.ts',
      'node/index': 'node/index.ts',
    },
    external: [/^onnxruntime-/],
  });
});
