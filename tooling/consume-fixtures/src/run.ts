#!/usr/bin/env -S node --experimental-strip-types
/**
 * The consume gate: prove the PACKED TARBALLS work for real consumers.
 *
 * Workspace checks (publint, attw, vitest, examples) all run against dev
 * exports. Packing is a transformation — publishConfig swap, `files`
 * allowlist, workspace:* rewriting — and this is the only harness that
 * executes its RESULT: four fixture projects, installed with npm from local
 * tarballs in a temp dir outside the workspace, one per consumer archetype.
 *
 * Fails loudly before `changeset publish` in the release pipeline.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..', '..');

/** Everything that ships to npm at 3.0: every member of the layered groups
 * (packages/<group>/<member>, per the naming law). Angular is validated by
 * ng-packagr + its parity script; engine-runtime's wasm build has its own
 * verify script — both are still PACKED here (they're in the dependency
 * closure), just not imported by fixtures directly (angular needs an Angular
 * toolchain). */
const GROUPS = ['core', 'engine', 'plugin', 'framework'];
const PACK_DIRS = [
  ...GROUPS.flatMap((g) =>
    fs
      .readdirSync(path.join(repoRoot, 'packages', g))
      .filter((d) => d !== 'angular')
      .filter((d) => fs.existsSync(path.join(repoRoot, 'packages', g, d, 'package.json')))
      .map((d) => path.join('packages', g, d)),
  ),
  // per-target sidecars (optionalDependencies of engine-runtime): wasm32 and
  // the current platform's napi target are REQUIRED (bundlers resolve the
  // wasm32 import statically; node loads the local napi binary). The other
  // targets are CI cross-compiles — packed when present, skipped with a log
  // otherwise (missing ones resolve as failed OPTIONAL deps in fixtures,
  // which is exactly what a real single-platform consumer install looks like).
  ...sidecarDirs(),
];

function sidecarDirs(): string[] {
  const npmDir = path.join(repoRoot, 'packages', 'engine', 'runtime', 'npm');
  const platformTarget = `${process.platform}-${process.arch}`;
  const required = new Set(['wasm32', platformTarget]);
  const dirs: string[] = [];
  for (const d of fs.readdirSync(npmDir)) {
    if (!fs.existsSync(path.join(npmDir, d, 'package.json'))) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(npmDir, d, 'package.json'), 'utf8'));
    const built = fs.existsSync(path.join(npmDir, d, pkg.files?.[0] ?? 'lib'));
    if (built) dirs.push(path.join('packages', 'engine', 'runtime', 'npm', d));
    else if (required.has(d)) {
      console.error(`✖ required engine-runtime target not built: npm/${d}`);
      process.exit(1);
    } else console.log(`  (skipping unbuilt cross-target npm/${d})`);
  }
  return dirs;
}

interface Fixture {
  name: string;
  /** extra registry deps beyond the packed tarballs */
  deps: Record<string, string>;
  check: string;
}

const FIXTURES: Fixture[] = [
  { name: 'node-esm', deps: { react: '^18.3.1', 'react-dom': '^18.3.1' }, check: 'node main.mjs' },
  { name: 'node-cjs', deps: { react: '^18.3.1', 'react-dom': '^18.3.1' }, check: 'node main.cjs' },
  {
    name: 'vite-app',
    deps: { react: '^18.3.1', 'react-dom': '^18.3.1', vite: '^6.0.0' },
    check: 'vite build',
  },
  {
    name: 'tsc-nodenext',
    deps: {
      react: '^18.3.1',
      'react-dom': '^18.3.1',
      '@types/react': '^18.3.0',
      '@types/react-dom': '^18.3.0',
      typescript: '^5.9.3',
    },
    check: 'tsc --noEmit -p tsconfig.json',
  },
];

function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

// ── 1. preflight: built artifacts must exist (first `files` entry) ──────────
const missing = PACK_DIRS.filter((d) => {
  const pkg = readJson(path.join(repoRoot, d, 'package.json'));
  const artifact: string = pkg.files?.[0] ?? 'dist';
  return !fs.existsSync(path.join(repoRoot, d, artifact));
});
if (missing.length) {
  console.error(`✖ built artifacts missing for: ${missing.join(', ')}`);
  console.error(
    '  Run: pnpm turbo run build --filter="./packages/*" --filter="./packages/engine*" --filter="./packages/engine/runtime"',
  );
  process.exit(1);
}

// ── 2. pack everything ──────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'epdf-consume-'));
const tarballDir = path.join(tmp, 'tarballs');
fs.mkdirSync(tarballDir);
console.log(`▸ packing ${PACK_DIRS.length} packages → ${tarballDir}`);

/** npm name → absolute tarball path */
const tarballs: Record<string, string> = {};
for (const dir of PACK_DIRS) {
  const abs = path.join(repoRoot, dir);
  const pkg = readJson(path.join(abs, 'package.json'));
  const out = sh('pnpm', ['pack', '--pack-destination', tarballDir], abs).trim();
  const last = out.split('\n').at(-1)!.trim();
  const tgz = path.isAbsolute(last) ? last : path.join(tarballDir, path.basename(last));
  if (!fs.existsSync(tgz)) {
    console.error(`✖ ${pkg.name}: cannot locate packed tarball (pack output: "${last}")`);
    process.exit(1);
  }
  tarballs[pkg.name] = tgz;

  // pack sanity: publishConfig must have been applied — no src/ refs in the
  // packed exports except declared epdf.rawExports.
  const packedManifest = sh('tar', ['-xOf', tgz, 'package/package.json'], tmp);
  const packed = JSON.parse(packedManifest);
  const raw: string[] = pkg.epdf?.rawExports ?? [];
  for (const [subpath, value] of Object.entries(packed.exports ?? {})) {
    if (raw.includes(subpath)) continue;
    if (JSON.stringify(value).includes('./src/')) {
      console.error(
        `✖ ${pkg.name}: packed exports["${subpath}"] still points at src/ — publishConfig not applied?`,
      );
      process.exit(1);
    }
  }
}

// ── 3. run fixtures ─────────────────────────────────────────────────────────
const results: Record<string, { ok: boolean; detail?: string }> = {};
for (const fixture of FIXTURES) {
  const dir = path.join(tmp, fixture.name);
  fs.cpSync(path.join(here, '..', 'fixtures', fixture.name), dir, { recursive: true });

  const deps: Record<string, string> = { ...fixture.deps };
  for (const [name, tgz] of Object.entries(tarballs)) deps[name] = `file:${tgz}`;
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: `epdf-fixture-${fixture.name}`,
        private: true,
        type: 'module',
        dependencies: deps,
        scripts: { check: fixture.check },
        // belt for transitive @embedpdf deps: never touch the registry for them
        overrides: Object.fromEntries(
          Object.entries(tarballs).map(([name, tgz]) => [name, `file:${tgz}`]),
        ),
      },
      null,
      2,
    ),
  );

  process.stdout.write(`▸ ${fixture.name}: install… `);
  try {
    sh('npm', ['install', '--no-audit', '--no-fund', '--loglevel=error'], dir);
    process.stdout.write('check… ');
    sh('npm', ['run', '--silent', 'check'], dir);
    console.log('✔');
    results[fixture.name] = { ok: true };
  } catch (err: any) {
    console.log('✖');
    results[fixture.name] = {
      ok: false,
      detail: [err.stdout, err.stderr, err.message].filter(Boolean).join('\n').slice(-4000),
    };
  }
}

// ── 4. report ───────────────────────────────────────────────────────────────
console.log('\nconsume gate results:');
let failed = false;
for (const [name, r] of Object.entries(results)) {
  console.log(`  ${r.ok ? '✔' : '✖'} ${name}`);
  if (!r.ok) {
    failed = true;
    console.log(
      r.detail
        ?.split('\n')
        .map((l) => `      ${l}`)
        .join('\n'),
    );
  }
}
if (!failed) fs.rmSync(tmp, { recursive: true, force: true });
else console.log(`\nfixture dirs kept for inspection: ${tmp}`);
process.exit(failed ? 1 : 0);
