import { defineConfig, Plugin } from 'vite';
import { createConfig, defineLibrary } from '@embedpdf/build/vite';

import { bundleWorker } from './tools/build-worker';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

/* ───── custom plugins ──────────────────────────────────────────── */
// Cache for the worker code – build once, reuse everywhere
let workerCodeCache: string | null = null;
let workerBuildPromise: Promise<string> | null = null;

// Cache for the encoder worker code
let encoderWorkerCodeCache: string | null = null;
let encoderWorkerBuildPromise: Promise<string> | null = null;

const workerReplacer = (): Plugin => {
  return {
    name: 'worker-replacer',
    async buildStart() {
      // Build the worker at most once across all plugin instances
      if (!workerBuildPromise) {
        workerBuildPromise = bundleWorker().then((code) => {
          workerCodeCache = code;
          return code;
        });
      }
      await workerBuildPromise;
    },
    transform(code) {
      if (!code.includes('__WEBWORKER_BODY__') || !workerCodeCache) return null;
      const escaped = JSON.stringify(workerCodeCache);
      return code.replace('__WEBWORKER_BODY__', escaped);
    },
  };
};

const encoderWorkerReplacer = (): Plugin => {
  return {
    name: 'encoder-worker-replacer',
    async buildStart() {
      // Build the encoder worker at most once across all plugin instances
      if (!encoderWorkerBuildPromise) {
        const { bundleEncoderWorker } = await import('./tools/build-encoder-worker');
        encoderWorkerBuildPromise = bundleEncoderWorker().then((code) => {
          encoderWorkerCodeCache = code;
          return code;
        });
      }
      await encoderWorkerBuildPromise;
    },
    transform(code) {
      if (!code.includes('__ENCODER_WORKER_BODY__') || !encoderWorkerCodeCache) return null;
      const escaped = JSON.stringify(encoderWorkerCodeCache);
      return code.replace(/__ENCODER_WORKER_BODY__/g, escaped);
    },
  };
};

/**
 * Injects the current package.json version into the bundle.
 * Replaces every occurrence of __PDFIUM_VERSION__ with the literal version string.
 */
const versionReplacer = (): Plugin => {
  const rootDir = dirname(fileURLToPath(import.meta.url));
  const { version } = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
    version: string;
  };
  const placeholder = /__PDFIUM_VERSION__/g;

  return {
    name: 'version-replacer',
    transform(code) {
      if (!placeholder.test(code)) return null;
      return {
        code: code.replace(placeholder, version),
        map: null,
      };
    },
  };
};

/* ───── entries ─────────────────────────────────────────────────── */
const baseEntries = {
  index: 'index.ts',
  'lib/pdfium/index': 'lib/pdfium/index.ts',
  'lib/pdfium/web/direct-engine': 'lib/pdfium/web/direct-engine.ts',
  'lib/pdfium/web/worker-engine': 'lib/pdfium/web/worker-engine.ts',
  'lib/webworker/engine': 'lib/webworker/engine.ts',
  'lib/converters/index': 'lib/converters/index.ts',
} as const;

export default defineConfig((env) => {
  if (env.mode === 'base') {
    return createConfig({
      tsconfigPath: './tsconfig.json',
      entryPath: baseEntries,
      dtsExclude: ['**/react/**', '**/preact/**', '**/vue/**', '**/svelte/**', '**/shared/**'],
      additionalPlugins: [workerReplacer(), encoderWorkerReplacer(), versionReplacer()],
    });
  }

  const config = async () => {
    const cfg = await defineLibrary()(env);
    if (!cfg.plugins) return cfg;
    cfg.plugins.push(versionReplacer());
    return cfg;
  };

  return config();
});
