import angular from '@analogjs/vite-plugin-angular';
import { playwright } from '@vitest/browser-playwright';
import { defineConfig, type ViteUserConfig } from 'vitest/config';

export interface AngularBrowserConfigOptions {
  /** Project label shown in Vitest output. */
  name: string;
  /** Absolute path to the package's tsconfig.json (consumed by @analogjs/vite-plugin-angular). */
  tsconfig: string;
  /** Test setup file(s) — typically `['src/test-setup.ts']`. */
  setupFiles: string[];
  /** Glob(s) of test files. Defaults to `src/**\/*.browser.spec.ts`. */
  include?: string[];
  /** Browser to launch. Defaults to chromium. */
  browser?: 'chromium' | 'firefox' | 'webkit';
  /** Run headless. Defaults to true so CI works out of the box. */
  headless?: boolean;
}

export function angularBrowserConfig({
  name,
  tsconfig,
  setupFiles,
  include = ['src/**/*.browser.spec.ts'],
  browser = 'chromium',
  headless = true,
}: AngularBrowserConfigOptions): ViteUserConfig {
  return defineConfig({
    resolve: {
      mainFields: ['module'],
    },
    plugins: [...angular({ tsconfig })],
    test: {
      name,
      globals: true,
      setupFiles,
      include,
      reporters: ['default'],
      browser: {
        enabled: true,
        headless,
        provider: playwright(),
        instances: [{ browser }],
      },
    },
  });
}
