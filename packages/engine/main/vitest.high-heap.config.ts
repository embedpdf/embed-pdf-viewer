import { defineConfig, mergeConfig } from 'vitest/config';

import base from './vitest.config';

// The suite at wasm addresses above 2 GiB (test/helpers/high-heap-setup.ts).
export default mergeConfig(
  base,
  defineConfig({ test: { setupFiles: ['test/helpers/high-heap-setup.ts'] } }),
);
