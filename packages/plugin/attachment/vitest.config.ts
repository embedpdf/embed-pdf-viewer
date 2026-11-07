import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The integration file boots a real WASM engine; under turbo in CI every package's tests
    // run at once, and its work there takes longer than the 5 s default.
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
