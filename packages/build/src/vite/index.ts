import fs from 'node:fs';
import path from 'node:path';
import { defineConfig, type UserConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import dts from 'unplugin-dts/vite';
import { SvelteDtsResolver } from './svelte-dts-resolver.js';

const sharedExternal = [/^@embedpdf\/(?!.*\/@framework$)/];

// ⚠️ keep your helper AS-IS
const beforeWriteFile = (outputPrefix: string) => (filePath: string, content: string) => {
  if (!outputPrefix) return; // no-op if empty

  if (filePath.includes(`${path.sep}dist${path.sep}shared${path.sep}`)) {
    const modifiedPath = filePath.replace(
      `${path.sep}shared${path.sep}`,
      `${path.sep}shared-${outputPrefix}${path.sep}`
    );
    return { filePath: modifiedPath, content };
  }

  const modifiedContent = content.replace(/\.\.\/shared/g, `../shared-${outputPrefix}`);
  return { filePath, content: modifiedContent };
};

/* ───── helpers ───────────────────────────────────────────────────── */
export function aliasFromTsconfig(tsconfigFile: string) {
  const raw = JSON.parse(fs.readFileSync(tsconfigFile, 'utf8'));
  const { paths = {}, baseUrl = '.' } = raw.compilerOptions ?? {};
  const baseDir = path.dirname(tsconfigFile);

  return Object.fromEntries(
    Object.entries(paths as Record<string, string[]>).map(([key, [p0]]) => {
      const isRelative = p0.startsWith('.') || p0.startsWith('/');
      return [key, isRelative ? path.resolve(baseDir, baseUrl, p0) : p0];
    }),
  );
}

const exists = (rel: string) =>
  fs.existsSync(path.resolve(process.cwd(), 'src', rel));

/* ───── preset core ───────────────────────────────────────────────── */
export interface ConfigOptions {
  tsconfigPath: string;
  entryPath: string | Record<string, string>;
  outputPrefix?: string;           
  external?: (string | RegExp)[];
  additionalPlugins?: any[];
  esbuildOptions?: UserConfig['esbuild'];
  dtsExclude?: string[];
  dtsOptions?: Record<string, any>;
  globals?: Record<string, string>;
  optimizeDeps?: UserConfig['optimizeDeps'];
  dtsEnabled?: boolean;
}

export function createConfig(opts: ConfigOptions): UserConfig {
  const {
    tsconfigPath,
    entryPath,
    outputPrefix = '',
    external = [],
    additionalPlugins = [],
    esbuildOptions = {},
    dtsExclude = [],
    dtsOptions = {},
    optimizeDeps,
    dtsEnabled = true,
  } = opts;

  const pkgRoot = process.cwd();
  const tsconfigAbs = path.resolve(
    pkgRoot,
    tsconfigPath.startsWith('.') ? tsconfigPath : path.join('src', tsconfigPath),
  );

  const entry = typeof entryPath === 'string'
    ? path.resolve(pkgRoot, 'src', entryPath)
    : Object.fromEntries(
        Object.entries(entryPath).map(([name, p]) => [
          name, path.resolve(pkgRoot, 'src', p)
        ])
      );

  const filePrefix = outputPrefix ? `${outputPrefix}/` : '';

  return {
    resolve: { alias: aliasFromTsconfig(tsconfigAbs) },
    esbuild: esbuildOptions,
    optimizeDeps,
    plugins: [
      ...additionalPlugins,
      ...(dtsEnabled
        ? [dts({
            tsconfigPath: tsconfigAbs,
            exclude: dtsExclude,
            beforeWriteFile: beforeWriteFile(outputPrefix),
            resolvers: [SvelteDtsResolver()],
            ...dtsOptions,
          })]
        : []),
    ],
    build: {
      emptyOutDir: false,
      sourcemap: true,
      lib: {
        entry,
        formats: ['es', 'cjs'],
        fileName: (fmt, entryName) => {
          if (typeof entryPath === 'object') {
            return `${filePrefix}${entryName}.${fmt === 'es' ? 'js' : 'cjs'}`;
          }
          return `${filePrefix}index.${fmt === 'es' ? 'js' : 'cjs'}`;
        },
      },
      minify: 'terser',
      rollupOptions: {
        external: [...external, ...sharedExternal],
        output: { dir: path.resolve(pkgRoot, 'dist') },
      },
    },
  };
}

/* ───── one-liner for leaf packages ──────────────────────────────── */
export function defineLibrary() {
  return defineConfig(({ mode }) => {
    switch (mode) {
      case 'react':
        if (!exists('react/index.ts')) throw new Error('No React adapter');
        return createConfig({
          tsconfigPath: 'react/tsconfig.react.json',
          entryPath: 'react/index.ts',
          outputPrefix: 'react',
          external: ['react', 'react/jsx-runtime', 'react-dom'],
        });

      case 'preact':
        if (!exists('preact/index.ts')) throw new Error('No Preact adapter');
        return createConfig({
          tsconfigPath: 'preact/tsconfig.preact.json',
          entryPath: 'preact/index.ts',
          outputPrefix: 'preact',
          external: [
            'preact',
            'preact/hooks',
            'preact/jsx-runtime',
            'preact/compat',
            'react',
            'react/jsx-runtime',
          ],
          esbuildOptions: { jsx: 'automatic', jsxImportSource: 'preact' },
        });

      case 'vue':
        if (!exists('vue/index.ts')) throw new Error('No Vue adapter');
        return createConfig({
          tsconfigPath: 'vue/tsconfig.vue.json',
          entryPath: 'vue/index.ts',
          outputPrefix: 'vue',
          external: ['vue'],
          additionalPlugins: [vue()],
          dtsOptions: { processor: 'vue' },
          optimizeDeps: {
            exclude: ['@embedpdf/plugin-interaction-manager']
          }
        });

      case 'svelte':
        if (!exists('svelte/index.ts')) throw new Error('No Svelte adapter');
        return createConfig({
          tsconfigPath: 'svelte/tsconfig.svelte.json',
          entryPath: 'svelte/index.ts',
          outputPrefix: 'svelte',
          external: [/^svelte($|\/)/],
          additionalPlugins: [svelte()]
        });

      default: // base
        return createConfig({
          tsconfigPath: './tsconfig.json',
          entryPath: 'index.ts',
          dtsExclude: ['**/react/**', '**/preact/**', '**/vue/**', '**/svelte/**'],
        });
    }
  });
}