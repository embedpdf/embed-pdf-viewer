import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // One file at a time, deliberately: the integration files boot real WASM
    // engines (the action-buttons e2e boots five whole kernels) and run
    // scripts under the WALL-CLOCK 50ms QuickJS budget
    // (DEFAULT_SCRIPT_BUDGET.maxExecutionMs — `Date.now() + 50` in
    // QuickJsSandbox). Parallel sibling forks starve the CPU enough that a
    // legitimate script blows that deadline and a commit spuriously reports
    // 'failed'. Serial files cost a few seconds and remove the flake class.
    fileParallelism: false,
  },
});
