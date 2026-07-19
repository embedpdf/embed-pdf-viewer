import fs from 'node:fs';
import path from 'node:path';
import type { UserConfig } from 'tsdown';

/**
 * The one library preset (see tooling/build/package.json for scope).
 *
 * The package.json `exports` map is the source of truth: it lists the curated
 * public entries as src/ paths (the repo's source-first pattern — workspace
 * consumers resolve TS source directly, no watch builds). epdf-build derives
 * the tsdown entries from that map, and tsdown regenerates both sides on every
 * build: dev `exports` (src) stay normalized in place, publish `exports`
 * (dist, import + require conditions) land in `publishConfig`. Internal
 * modules simply aren't listed, wherever they live in src/.
 */
export function presetConfig(overrides: UserConfig = {}): UserConfig {
  const pkg = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8'));
  const raw: string[] = pkg.epdf?.rawExports ?? [];
  const rawEntries = Object.fromEntries(
    raw.map((subpath: string) => [subpath, pkg.exports?.[subpath]]),
  );
  return {
    entry: entriesFromExports(pkg, raw),
    format: ['esm', 'cjs'],
    platform: 'neutral',
    target: 'es2020',
    dts: true,
    sourcemap: true,
    exports: {
      // Default: pure source-first (dev exports -> src, publish -> dist).
      // 'development' (epdf.devExports): condition-split for boundary packages
      // whose source needs wider libs (DOM/ES2022) than their consumers allow —
      // TS resolves dist .d.ts (skipLibCheck shields consumers' stricter or
      // narrower tsconfigs), while Vite's dev server still reads src for HMR
      // via the `development` condition.
      devExports: pkg.epdf?.devExports ?? true,
      // epdf.rawExports (package.json): subpaths shipped verbatim in BOTH the
      // dev and publish maps — e.g. a worker entry published as TS source for
      // the consumer's bundler to compile. Never built, never rewritten.
      customExports: (generated) => ({ ...generated, ...rawEntries }),
    },
    publint: true,
    // node16 profile: subpath exports are invisible to legacy node10 module
    // resolution; v3's documented floor is TS >= 4.7 with node16/bundler.
    // rawExports are bundler-only entries (shipped TS source) — Node never
    // resolves them, so they're excluded from the check.
    attw: { profile: 'node16', level: 'error', excludeEntrypoints: raw },
    // Deterministic builds: the preset is the only config source.
    config: false,
    name: pkg.name,
    ...overrides,
  };
}

interface PackageJson {
  name?: string;
  exports?: Record<string, unknown>;
  epdf?: { rawExports?: string[]; devExports?: true | string };
}

/**
 * './runtime' -> { runtime: './src/runtime.tsx' }, '.' -> { index: ... }.
 * Accepts both the normalized string form tsdown writes back and the
 * handwritten { types, import } object form found on first conversion.
 */
function entriesFromExports(pkg: PackageJson, skip: string[] = []): Record<string, string> {
  const entries: Record<string, string> = {};
  for (const [subpath, value] of Object.entries(pkg.exports ?? {})) {
    if (subpath === './package.json' || skip.includes(subpath)) continue;
    const target =
      typeof value === 'string'
        ? value
        : ((value as Record<string, string>)?.development ??
          (value as Record<string, string>)?.import ??
          (value as Record<string, string>)?.default ??
          (value as Record<string, string>)?.types);
    if (!target?.startsWith('./src/')) continue;
    entries[subpath === '.' ? 'index' : subpath.slice(2)] = target;
  }
  if (Object.keys(entries).length === 0) {
    throw new Error(
      `${pkg.name}: no src/ entries found in package.json "exports" — ` +
        `the preset derives its entry list from the exports map (see tooling/build).`,
    );
  }
  return entries;
}
