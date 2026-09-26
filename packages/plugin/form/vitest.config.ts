import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // One file at a time, deliberately: the integration files boot real WASM
    // engines (the action-buttons e2e boots five whole kernels) and run
    // scripts under a WALL-CLOCK QuickJS deadline (`Date.now() +
    // maxExecutionMs` in QuickJsSandbox). Parallel sibling forks starve the
    // CPU enough that a legitimate script blows that deadline and a commit
    // spuriously reports 'failed'; the standalone realm's TEST_SCRIPT_BUDGET
    // widens it for the same reason (sibling packages under turbo in CI).
    // Serial files cost a few seconds.
    fileParallelism: false,
  },
});
