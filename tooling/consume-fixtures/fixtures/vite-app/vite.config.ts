import { defineConfig } from 'vite';

// Mirrors the documented consumer config: the engine worker code-splits
// (wasm target resolution), so the worker bundle must be ES format.
export default defineConfig({
  worker: { format: 'es' },
});
