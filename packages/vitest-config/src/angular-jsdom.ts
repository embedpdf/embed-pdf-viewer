import angular from '@analogjs/vite-plugin-angular';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

export interface AngularJsdomConfigOptions {
  /** Project label shown in Vitest output. */
  name: string;
  /** Absolute path to the package's tsconfig.json (consumed by @analogjs/vite-plugin-angular). */
  tsconfig: string;
  /** Test setup file(s) — typically `['src/test-setup.ts']`. */
  setupFiles: string[];
  /** Glob(s) of test files. Defaults to `src/**\/*.{test,spec}.ts`. */
  include?: string[];
  /** Globs to exclude. Defaults to ignoring `*.browser.spec.ts` so they're left to the browser-mode project. */
  exclude?: string[];
}

export function angularJsdomConfig({
  name,
  tsconfig,
  setupFiles,
  include = ['src/**/*.{test,spec}.ts'],
  exclude = ['**/*.browser.spec.ts', 'node_modules/**'],
}: AngularJsdomConfigOptions): ViteUserConfig {
  return defineConfig({
    resolve: {
      mainFields: ['module'],
    },
    plugins: [...angular({ tsconfig })],
    test: {
      name,
      globals: true,
      environment: 'jsdom',
      setupFiles,
      include,
      exclude,
    },
  });
}
