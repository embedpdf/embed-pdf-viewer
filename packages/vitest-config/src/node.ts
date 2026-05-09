import { defineConfig, type ViteUserConfig } from 'vitest/config';

export interface NodeConfigOptions {
  /** Project label shown in Vitest output. Required so root projects array stays readable. */
  name: string;
  /** Glob(s) of test files. Defaults to `src/**\/*.test.ts` and `test/**\/*.test.ts`. */
  include?: string[];
  /** Optional per-test timeout (ms). */
  testTimeout?: number;
  /** Optional per-hook timeout (ms). Useful when `beforeAll` shells out long-running subprocesses. */
  hookTimeout?: number;
  /** Extra plugins (rarely needed for node-mode unit tests). */
  plugins?: ViteUserConfig['plugins'];
}

export function nodeConfig({
  name,
  include = ['src/**/*.test.ts', 'test/**/*.test.ts'],
  testTimeout,
  hookTimeout,
  plugins = [],
}: NodeConfigOptions): ViteUserConfig {
  return defineConfig({
    plugins,
    test: {
      name,
      globals: true,
      environment: 'node',
      include,
      ...(testTimeout !== undefined ? { testTimeout } : {}),
      ...(hookTimeout !== undefined ? { hookTimeout } : {}),
    },
  });
}
