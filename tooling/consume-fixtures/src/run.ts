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

function sh(cmd: string, args: string[], cwd: string): string {
  return execFileSync(cmd, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

function readJson(p: string): any {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

interface WorkspacePackage {
  name: string;
  path: string;
  version: string;
  private?: boolean;
}

/**
 * `private !== true` is the publication source of truth. Deriving this list
 * from pnpm's workspace view keeps the gate aligned with `pnpm publish -r`
 * and covers packages/, ee/, Angular, and the full-viewer packages without a
 * second hand-maintained release list.
 */
const WORKSPACE_PACKAGES = JSON.parse(
  sh('pnpm', ['list', '-r', '--depth', '-1', '--json'], repoRoot),
) as WorkspacePackage[];
const WORKSPACE_BY_NAME = new Map(WORKSPACE_PACKAGES.map((pkg) => [pkg.name, pkg]));
const PUBLISHABLE_PACKAGES = WORKSPACE_PACKAGES.filter((pkg) => pkg.private !== true);
const RUNTIME_SIDECAR_PREFIX = path.join('packages', 'engine', 'runtime', 'npm') + path.sep;
const REQUIRED_RUNTIME_TARGETS = new Set(['wasm32', `${process.platform}-${process.arch}`]);

const PACK_DIRS = PUBLISHABLE_PACKAGES.flatMap((workspacePkg) => {
  const dir = path.relative(repoRoot, workspacePkg.path);
  if (!dir || dir.startsWith(`..${path.sep}`) || path.isAbsolute(dir)) {
    console.error(`✖ ${workspacePkg.name}: workspace path is outside the repository`);
    process.exit(1);
  }

  const pkg = readJson(path.join(workspacePkg.path, 'package.json'));
  const artifact: string = pkg.files?.[0] ?? 'dist';
  if (fs.existsSync(path.join(workspacePkg.path, artifact))) return [dir];

  // A local developer normally has only wasm32 and the current native target.
  // Release CI downloads every cross-compiled target, so all sidecars are
  // packed there. Missing non-current targets remain legitimate optional deps
  // for a local consume run.
  if (dir.startsWith(RUNTIME_SIDECAR_PREFIX)) {
    const target = path.basename(dir);
    if (!REQUIRED_RUNTIME_TARGETS.has(target)) {
      console.log(`  (skipping unbuilt optional runtime target npm/${target})`);
      return [];
    }
  }

  return [dir];
});

interface Fixture {
  name: string;
  /** Packed packages installed as the fixture's direct consumer surface. */
  packages: string[];
  /** extra registry deps beyond the packed tarballs */
  deps: Record<string, string>;
  check: string;
}

const FIXTURES: Fixture[] = [
  {
    name: 'node-esm',
    packages: [
      '@cloudpdf/admin',
      '@cloudpdf/engine',
      '@embedpdf/core-annotation',
      '@embedpdf/core-geometry',
      '@embedpdf/core-stage',
      '@embedpdf/core-ui',
      '@embedpdf/core',
      '@embedpdf/engine-core',
      '@embedpdf/engine-services',
      '@embedpdf/engine',
      '@embedpdf/plugin-annotation',
      '@embedpdf/plugin-search',
      '@embedpdf/plugin-stage',
      '@embedpdf/react',
      '@embedpdf/web',
    ],
    deps: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    check: 'node main.mjs',
  },
  {
    name: 'node-cjs',
    packages: [
      '@cloudpdf/admin',
      '@cloudpdf/engine',
      '@embedpdf/core-annotation',
      '@embedpdf/core-geometry',
      '@embedpdf/core-ui',
      '@embedpdf/core',
      '@embedpdf/engine-core',
      '@embedpdf/engine-services',
      '@embedpdf/engine',
      '@embedpdf/plugin-annotation',
      '@embedpdf/plugin-stage',
      '@embedpdf/react',
    ],
    deps: { react: '^18.3.1', 'react-dom': '^18.3.1' },
    check: 'node main.cjs',
  },
  {
    name: 'vite-app',
    packages: [
      '@cloudpdf/viewer-react',
      '@cloudpdf/viewer',
      '@embedpdf/engine',
      '@embedpdf/react',
      '@embedpdf/viewer-react',
      '@embedpdf/viewer',
    ],
    deps: { react: '^18.3.1', 'react-dom': '^18.3.1', vite: '^6.0.0' },
    check: 'vite build',
  },
  {
    name: 'tsc-nodenext',
    packages: [
      '@embedpdf/core-geometry',
      '@embedpdf/engine-core',
      '@embedpdf/engine',
      '@embedpdf/react',
    ],
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

// ── 1. preflight: built artifacts must exist (first `files` entry) ──────────
const missing = PACK_DIRS.filter((d) => {
  const pkg = readJson(path.join(repoRoot, d, 'package.json'));
  const artifact: string = pkg.files?.[0] ?? 'dist';
  return !fs.existsSync(path.join(repoRoot, d, artifact));
});
if (missing.length) {
  console.error(`✖ built artifacts missing for: ${missing.join(', ')}`);
  console.error('  Run: pnpm run build:release');
  process.exit(1);
}

// ── 2. pack everything ──────────────────────────────────────────────────────
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'epdf-consume-'));
const tarballDir = path.join(tmp, 'tarballs');
fs.mkdirSync(tarballDir);
console.log(
  `▸ packing ${PACK_DIRS.length}/${PUBLISHABLE_PACKAGES.length} publishable packages → ${tarballDir}`,
);

/** npm name → absolute tarball path */
const tarballs: Record<string, string> = {};
const packedManifests: Record<string, any> = {};
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
  packedManifests[pkg.name] = packed;
  if (packed.private === true) {
    console.error(`✖ ${pkg.name}: packed manifest is still private`);
    process.exit(1);
  }
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

// Every scoped dependency in a published manifest must resolve to another
// publishable workspace tarball. This catches the exact failure mode where a
// public package depends on a workspace package that npm publication skips.
let closureFailed = false;
for (const [owner, packed] of Object.entries(packedManifests)) {
  for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
    for (const [dependency, range] of Object.entries(packed[section] ?? {})) {
      if (!dependency.startsWith('@embedpdf/') && !dependency.startsWith('@cloudpdf/')) continue;

      const workspaceDependency = WORKSPACE_BY_NAME.get(dependency);
      if (!workspaceDependency) {
        console.error(`✖ ${owner}: ${section} references unknown workspace package ${dependency}`);
        closureFailed = true;
        continue;
      }
      if (workspaceDependency.private === true) {
        console.error(`✖ ${owner}: ${section} references private package ${dependency}`);
        closureFailed = true;
      }
      if (String(range).startsWith('workspace:')) {
        console.error(`✖ ${owner}: packed ${section}.${dependency} still uses ${range}`);
        closureFailed = true;
      }
      if (!tarballs[dependency] && section !== 'optionalDependencies') {
        console.error(`✖ ${owner}: no packed tarball for required dependency ${dependency}`);
        closureFailed = true;
      }
    }
  }
}
if (closureFailed) process.exit(1);
console.log('✔ packed publication graph is closed over public workspace packages');

// ── 3. run fixtures ─────────────────────────────────────────────────────────
const results: Record<string, { ok: boolean; detail?: string }> = {};
for (const fixture of FIXTURES) {
  const dir = path.join(tmp, fixture.name);
  fs.cpSync(path.join(here, '..', 'fixtures', fixture.name), dir, { recursive: true });

  const deps: Record<string, string> = { ...fixture.deps };
  for (const name of fixture.packages) {
    const tgz = tarballs[name];
    if (!tgz) {
      console.error(`✖ ${fixture.name}: requested package was not packed: ${name}`);
      process.exit(1);
    }
    deps[name] = `file:${tgz}`;
  }
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
