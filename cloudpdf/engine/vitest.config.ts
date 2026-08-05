import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    testTimeout: 30_000,
    // Every suite's beforeAll boots a FULL server fixture (Fastify + a
    // native-PDFium worker pool + migrations). With all suites running —
    // the restructure had silently ENOENT-skipped seven of them — parallel
    // cold boots contend on CPU and can legitimately exceed 30s on a busy
    // machine. Tests themselves keep the 30s budget.
    hookTimeout: 120_000,
    // Bound the parallel fixture boots; each fork is a whole server + pool.
    minWorkers: 1,
    maxWorkers: 4,
    include: ['test/**/*.test.ts'],
  },
});
