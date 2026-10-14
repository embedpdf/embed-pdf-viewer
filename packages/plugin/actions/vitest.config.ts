import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The suites boot real WASM engines. Under turbo in CI every package's tests run at once, and
    // a document's engine work there takes longer than the 5 s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
