#!/usr/bin/env node
/**
 * The publish check of a framework package (Vue, Svelte): what a user who installs it from npm
 * gets, proven on the packed tarball. In the workspace its `exports` point at the source, so the
 * tests and type checks never see the build; this does. Its `build` script ends with it, the way
 * the tsdown preset's builds end with publint and attw.
 *
 * 1. Pack it with pnpm, which applies `publishConfig` and rewrites `workspace:` ranges.
 * 2. Read the manifest: every field and export names a shipped file, every JavaScript entry has
 *    its types, nothing but `dist` ships, no `workspace:` range is left, and every package a
 *    shipped file imports is a dependency or peer dependency (a strict installer like pnpm links
 *    nothing else).
 * 3. publint, and attw under TypeScript's `node16` and `bundler` resolution, as in the preset
 *    (`preset.ts`). A package without a `require` condition is ESM-only, so CommonJS resolution
 *    isn't checked; a `.svelte` component import is resolved by Svelte's tooling, not TypeScript.
 * 4. Install the tarball in a consumer app outside the workspace (the package's `consumer/`
 *    files, and one more importing every entry), its other dependencies linked to the workspace
 *    packages, and type-check it with the framework's checker (`vue-tsc`, `svelte-check`) and
 *    `skipLibCheck: false`. A line marked `error expected` must fail, proof that the types aren't
 *    `any`; nothing else in the app or the package may.
 *
 *   node ../../../tooling/build/src/check-framework-package.mjs   # in the package, after build
 */
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { checkPackage, createPackageFromTarballData } from '@arethetypeswrong/core';
import { publint } from 'publint';
import { formatMessage } from 'publint/utils';
import { importsIn, walk } from './package-files.mjs';

/** A line that must fail ends in `// error expected` (`<!-- error expected -->` in markup). */
const EXPECTED = /(\/\/|<!--)\s*error expected\b/;

/** The compiler options of a consumer app, as `create-vue` and SvelteKit set them up. */
const CONSUMER_OPTIONS = {
  target: 'ES2022',
  module: 'ESNext',
  moduleResolution: 'bundler',
  lib: ['ES2022', 'DOM', 'DOM.Iterable'],
  strict: true,
  skipLibCheck: false,
  isolatedModules: true,
  verbatimModuleSyntax: true,
  noEmit: true,
  types: [],
};

/** Each framework's checker, how its app is configured, and how its diagnostics read. */
const FRAMEWORKS = {
  vue: {
    checker: 'vue-tsc',
    args: ['--noEmit', '--pretty', 'false', '-p', 'tsconfig.json'],
    tsconfig: {
      compilerOptions: { ...CONSUMER_OPTIONS, jsx: 'preserve' },
      // A component, prop or event the package doesn't have is an error.
      vueCompilerOptions: { strictTemplates: true },
    },
    read: readTscDiagnostics,
  },
  svelte: {
    checker: 'svelte-check',
    args: ['--tsconfig', './tsconfig.json', '--output', 'machine-verbose', '--threshold', 'error'],
    tsconfig: { compilerOptions: CONSUMER_OPTIONS },
    read: readSvelteCheckDiagnostics,
    // `svelte-check` resolves `./Viewer.svelte` to `Viewer.svelte.d.ts`; TypeScript alone can't.
    resolvedByTooling: /\.svelte$/,
  },
};

const packageDir = process.cwd();
const manifest = readJson(path.join(packageDir, 'package.json'));
const frameworkName = Object.keys(FRAMEWORKS).find((name) => manifest.peerDependencies?.[name]);
if (!frameworkName) fail(`${manifest.name}: no Vue or Svelte peer dependency, nothing to check`);
const framework = FRAMEWORKS[frameworkName];
if (!fs.existsSync(path.join(packageDir, 'dist'))) fail(`${manifest.name}: no dist; build first`);

const failures = [];
const run = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'epdf-publish-check-'));

// ── 1. pack ─────────────────────────────────────────────────────────────────

execFileSync('pnpm', ['pack', '--pack-destination', run], {
  cwd: packageDir,
  stdio: ['ignore', 'ignore', 'pipe'],
});
const tarball = path.join(
  run,
  fs.readdirSync(run).find((name) => name.endsWith('.tgz')),
);
const app = path.join(run, 'app');
const installed = path.join(app, 'node_modules', manifest.name);
fs.mkdirSync(installed, { recursive: true });
execFileSync('tar', ['-xzf', tarball, '-C', installed, '--strip-components', '1']);
const packed = readJson(path.join(installed, 'package.json'));
const shipped = walk(installed).map((file) => toPosix(path.relative(installed, file)));

// ── 2. the manifest ─────────────────────────────────────────────────────────

const ranges = ['dependencies', 'peerDependencies', 'optionalDependencies', 'devDependencies'];
for (const section of ranges) {
  for (const [name, range] of Object.entries(packed[section] ?? {})) {
    if (String(range).startsWith('workspace:')) failures.push(`${section}.${name} is "${range}"`);
  }
}

const exists = (target) => shipped.includes(target.replace(/^\.\//, ''));
for (const field of ['main', 'module', 'types', 'svelte']) {
  if (packed[field] && !exists(packed[field])) {
    failures.push(`"${field}": "${packed[field]}" isn't in the package`);
  }
}
for (const [subpath, target] of Object.entries(packed.exports ?? {})) {
  for (const { conditions, file, typed } of leaves(target)) {
    const at = `exports["${subpath}"]${conditions.map((name) => `.${name}`).join('')}`;
    if (!exists(file)) failures.push(`${at}: "${file}" isn't in the package`);
    // TypeScript reads a JavaScript file's types from a `types` condition, else from the
    // declaration next to it.
    const declaration = file.replace(/\.(c|m)?js$/, (_, kind) => `.d.${kind ?? ''}ts`);
    if (/\.(c|m)?js$/.test(file) && !typed && !exists(declaration)) {
      failures.push(`${at}: "${file}" has no types (no "types" condition, no ${declaration})`);
    }
  }
}

const KEPT = new Set(['package.json', 'README.md', 'LICENSE', 'CHANGELOG.md']);
for (const file of shipped) {
  if (!KEPT.has(file) && !file.startsWith('dist/')) failures.push(`ships ${file}, outside dist`);
  if (/\.(test|spec)\.|(^|\/)(src|test)\//.test(file)) failures.push(`ships ${file}`);
}

const declared = new Set([
  packed.name,
  ...Object.keys(packed.dependencies ?? {}),
  ...Object.keys(packed.peerDependencies ?? {}),
  ...Object.keys(packed.optionalDependencies ?? {}),
]);
const undeclared = new Map();
const unresolved = [];
for (const file of shipped.filter((name) => /\.(js|cjs|d\.c?ts|svelte)$/.test(name))) {
  const code = fs.readFileSync(path.join(installed, file), 'utf8');
  for (const { specifier } of importsIn(code, file)) {
    // Node and webpack don't guess extensions: a relative import in code names its file exactly.
    // (A declaration's `./scope.js` means `scope.d.ts`; attw checks those below.)
    if (specifier.startsWith('.') && !/\.d\.c?ts$/.test(file)) {
      if (!exists(path.posix.join(path.posix.dirname(file), specifier))) {
        unresolved.push(`${file} → "${specifier}"`);
      }
    }
    if (/^(\.|\/|node:)/.test(specifier)) continue;
    const name = specifier
      .split('/')
      .slice(0, specifier.startsWith('@') ? 2 : 1)
      .join('/');
    if (!declared.has(name)) undeclared.set(name, [...(undeclared.get(name) ?? []), file]);
  }
}
for (const [name, files] of undeclared) {
  failures.push(`imports ${name}, which isn't a dependency (${files.slice(0, 3).join(', ')})`);
}
if (unresolved.length) {
  const more = unresolved.length > 3 ? `, and ${unresolved.length - 3} more` : '';
  failures.push(`imports no file exactly: ${unresolved.slice(0, 3).join(', ')}${more}`);
}

// ── 3. publint and attw ─────────────────────────────────────────────────────

const tarballData = new Uint8Array(fs.readFileSync(tarball));
const lint = await publint({
  pack: { tarball: tarballData.buffer },
  level: 'warning',
  strict: true,
});
for (const message of lint.messages) {
  if (message.type === 'error') failures.push(`publint: ${formatMessage(message, lint.pkg)}`);
}

const esmOnly = !JSON.stringify(packed.exports ?? {}).includes('"require"');
const types = await checkPackage(createPackageFromTarballData(tarballData));
if (types.types === false) failures.push('attw: the package ships no types');
const problems = new Map();
for (const problem of types.types === false ? [] : types.problems) {
  const resolution = problem.resolutionKind ?? problem.resolutionOption;
  if (resolution === 'node10') continue; // Subpath exports need node16 or bundler: v3's floor.
  if (esmOnly && (resolution === 'node16-cjs' || problem.kind === 'CJSResolvesToESM')) continue;
  if (framework.resolvedByTooling?.test(problem.moduleSpecifier ?? '')) continue;
  const kind = resolution ? `${problem.kind} (${resolution})` : problem.kind;
  problems.set(kind, [...(problems.get(kind) ?? []), whereIs(problem)]);
}
for (const [kind, places] of problems) {
  const more = places.length > 3 ? `, and ${places.length - 3} more` : '';
  failures.push(`attw: ${kind} in ${places.slice(0, 3).join(', ')}${more}`);
}

// ── 4. a consumer app ───────────────────────────────────────────────────────

// The package's dependencies, its peer (the framework) and the engine the app starts it with, as
// the workspace has them linked for the package itself.
const link = (name) => {
  const at = path.join(app, 'node_modules', name);
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(fs.realpathSync(path.join(packageDir, 'node_modules', name)), at);
};
for (const name of Object.keys({ ...packed.dependencies, ...packed.peerDependencies })) link(name);
link('@embedpdf/engine');

const source = path.join(app, 'src');
fs.cpSync(path.join(packageDir, 'consumer'), source, { recursive: true });
const subpaths = Object.keys(packed.exports).filter((subpath) => subpath !== './package.json');
const entryImports = subpaths.map((subpath, i) => {
  return `import * as entry${i} from '${path.posix.join(packed.name, subpath)}';`;
});
fs.writeFileSync(
  path.join(source, 'entries.ts'),
  [
    '// Every entry the package publishes, each of which must resolve to its types.',
    ...entryImports,
    `export const entries = [${subpaths.map((_, i) => `entry${i}`).join(', ')}];`,
    '',
  ].join('\n'),
);
writeJson(path.join(app, 'package.json'), { name: 'consumer', private: true, type: 'module' });
writeJson(path.join(app, 'tsconfig.json'), { ...framework.tsconfig, include: ['src'] });

const checker = path.join(packageDir, 'node_modules', framework.checker);
const { bin } = readJson(path.join(checker, 'package.json'));
const entry = path.join(checker, typeof bin === 'string' ? bin : bin[framework.checker]);
const result = spawnSync(process.execPath, [entry, ...framework.args], {
  cwd: app,
  encoding: 'utf8',
  maxBuffer: 64 * 1024 * 1024,
});
const diagnostics = framework.read(result, app);
if (!diagnostics) {
  const reason = `${result.stderr}\n${result.stdout}`.trim().split('\n')[0];
  failures.push(`${framework.checker} didn't run: ${reason}`);
}

const expected = new Set();
for (const file of walk(source)) {
  fs.readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, index) => EXPECTED.test(line) && expected.add(`${file}:${index + 1}`));
}
// The app's files and the package's are checked; another package's errors (a dependency's
// declarations under `skipLibCheck: false`) are that package's to fix, so only named.
const ours = (file) => file.startsWith(source + path.sep) || file.startsWith(installed + path.sep);
const others = new Set();
const met = new Set();
for (const { file, line, message } of diagnostics ?? []) {
  if (!ours(file)) others.add(packageOf(file));
  else if (expected.has(`${file}:${line}`)) met.add(`${file}:${line}`);
  else failures.push(`${framework.checker}: ${path.relative(app, file)}:${line} ${message}`);
}
for (const at of expected) {
  if (met.has(at)) continue;
  failures.push(
    `${framework.checker}: no error at ${path.relative(app, at)}, marked "error expected"`,
  );
}

// ── the verdict ─────────────────────────────────────────────────────────────

const summary =
  `${shipped.length} files, ${subpaths.length} entries, ${expected.size} expected errors` +
  (others.size ? `; errors in other packages' files, not checked: ${[...others].join(', ')}` : '');
if (failures.length) {
  console.error(`✖ ${packed.name} as published (${summary}):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  console.error(`  the packed package and the app are kept in ${run}`);
  process.exit(1);
}
fs.rmSync(run, { recursive: true, force: true });
console.log(`✔ ${packed.name} as published: ${summary}`);

// ── helpers ─────────────────────────────────────────────────────────────────

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`);
}

function toPosix(file) {
  return file.split(path.sep).join('/');
}

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

/**
 * Every file an `exports` value names, with the conditions on the way to it, and whether a `types`
 * condition next to it or above it gives its types.
 */
function leaves(value, conditions = [], typed = false) {
  if (typeof value === 'string') return [{ conditions, file: value, typed }];
  if (!value || typeof value !== 'object') return [];
  const withTypes = typed || typeof value.types === 'string';
  return Object.entries(value).flatMap(([condition, target]) =>
    leaves(target, [...conditions, condition], withTypes),
  );
}

/** The package a file belongs to: the last `node_modules/<name>` in its path, else its folder. */
function packageOf(file) {
  const names = [...toPosix(file).matchAll(/node_modules\/((?:@[^/]+\/)?[^/]+)\//g)];
  return names.at(-1)?.[1] ?? path.dirname(file);
}

/** Where an attw problem is, for the report: an entry point, or a file and what it imports. */
function whereIs(problem) {
  const local = (file) => file?.replace(`/node_modules/${manifest.name}/`, '');
  if (problem.moduleSpecifier) return `${local(problem.fileName)} → "${problem.moduleSpecifier}"`;
  if (problem.typesFileName) {
    return `${local(problem.typesFileName)} (types of ${local(problem.implementationFileName)})`;
  }
  return `"${problem.entrypoint}"`;
}

/** `file(line,column): error TS1234: message`, a message's later lines indented under it. */
function readTscDiagnostics(result, root) {
  const diagnostics = [];
  for (const line of `${result.stdout}${result.stderr}`.split('\n')) {
    const match = line.match(/^(.+?)\((\d+),(\d+)\): error TS\d+: (.*)$/);
    if (match) {
      const [, file, row, , message] = match;
      diagnostics.push({ file: path.resolve(root, file), line: Number(row), message });
    } else if (/^\s/.test(line) && diagnostics.length) {
      diagnostics.at(-1).message += ` ${line.trim()}`;
    }
  }
  return result.status !== 0 && diagnostics.length === 0 ? null : diagnostics;
}

/** Lines of `<time> {"type":"ERROR","filename":…,"start":{"line":0},…}`, then `COMPLETED`. */
function readSvelteCheckDiagnostics(result, root) {
  const diagnostics = [];
  let completed = false;
  for (const line of result.stdout.split('\n')) {
    const json = line.match(/^\d+ (\{.*\})$/);
    if (json) {
      const diagnostic = JSON.parse(json[1]);
      if (diagnostic.type !== 'ERROR') continue;
      diagnostics.push({
        file: path.resolve(root, diagnostic.filename),
        line: diagnostic.start.line + 1,
        message: diagnostic.message,
      });
    } else if (/^\d+ COMPLETED\b/.test(line)) {
      completed = true;
    }
  }
  return completed ? diagnostics : null;
}
