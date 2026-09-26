#!/usr/bin/env node
/**
 * API snapshot (G10): every publishable package's public entry points, rolled
 * up to one text file per entry under `api/`, committed and diffed in CI.
 *
 *   node tooling/build/src/api-snapshot.mjs          # write snapshots
 *   node tooling/build/src/api-snapshot.mjs --check  # fail on drift
 *
 * Works on SOURCE entries (the `exports` map points at `src/*.ts`), so no
 * build is needed; a line per exported symbol with its declaration text, so
 * a diff reads as an API change. Signatures stay authored in TypeScript —
 * this is a mirror, never a second source of truth.
 *
 * Source-first all the way down: re-exports are followed with the
 * `development` condition (what Vite's dev server resolves), so a boundary
 * package's `import` → dist types never enter the picture, and a package
 * whose types only exist as `tsc --emitDeclarationOnly` mirrors (the viewer's
 * doors) is read through the src/ file its dist/ declaration mirrors. A
 * snapshot therefore never depends on what happens to be built — it is the
 * same text on a bare checkout (CI's contract job) and a developer's machine.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = path.resolve(new URL('../../..', import.meta.url).pathname);
const check = process.argv.includes('--check');
const outRoot = path.join(root, 'api');

function workspacePackages() {
  const json = execFileSync('pnpm', ['ls', '-r', '--depth', '-1', '--json'], { cwd: root, encoding: 'utf8' });
  return JSON.parse(json)
    .filter((p) => p.path.startsWith(path.join(root, 'packages') + path.sep))
    .map((p) => ({ name: p.name, dir: p.path, manifest: JSON.parse(fs.readFileSync(path.join(p.path, 'package.json'), 'utf8')) }))
    .filter((p) => p.manifest.private !== true && p.manifest.exports);
}

function sourceEntries(pkg) {
  const entries = [];
  for (const subpath of Object.keys(pkg.manifest.exports)) {
    const file = sourceOf(pkg, subpath);
    if (!file) continue;
    entries.push({ subpath: subpath === '.' ? 'index' : subpath.replace(/^\.\//, '').replace(/\//g, '__'), file });
  }
  return entries;
}

/**
 * The source file behind a package's export subpath, read from the manifest
 * alone (never from what is built): the source condition when the package
 * has one, else the src/ file its `types` declaration mirrors (a package built
 * outside the preset — the viewer's doors). Null when the subpath is not a
 * TypeScript surface (a CSS file, a worker's shipped d.ts, package.json).
 */
function sourceOf(pkg, subpath) {
  const target = pkg.manifest.exports?.[subpath];
  const declared =
    typeof target === 'string' ? target : (target?.development ?? target?.import ?? target?.default);
  if (typeof declared === 'string' && isSource(declared)) return path.join(pkg.dir, declared);
  if (typeof target?.types === 'string') return sourceOfMirror(path.join(pkg.dir, target.types));
  return null;
}

/** `@embedpdf/viewer/core` → the workspace package and its export subpath, if it names one. */
function workspaceSubpath(specifier) {
  const m = /^((?:@[^/]+\/)?[^/]+)(\/.+)?$/.exec(specifier);
  const pkg = m && packagesByName.get(m[1]);
  return pkg ? { pkg, subpath: m[2] ? `.${m[2]}` : '.' } : null;
}

const isSource = (file) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts');

/**
 * `<pkg>/dist/<x>.d.ts` → `<pkg>/src/<x>.ts` when that source exists — the
 * layout `tsc --emitDeclarationOnly` (rootDir src, outDir dist) produces, and
 * the only way a workspace package without a source condition exposes types.
 * Workspace packages only: a dependency from the registry that happens to
 * ship both src/ and dist/ is left to its own declarations.
 */
function sourceOfMirror(declaration) {
  const m = /^(.*)[\\/]dist[\\/](.*)\.d\.ts$/.exec(declaration);
  if (!m || !workspaceDirs.has(m[1])) return null;
  for (const ext of ['.ts', '.tsx']) {
    const candidate = path.join(m[1], 'src', `${m[2]}${ext}`);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function findTsconfig(dir) {
  let current = dir;
  while (current !== path.dirname(current)) {
    const candidate = path.join(current, 'tsconfig.json');
    if (fs.existsSync(candidate)) return candidate;
    current = path.dirname(current);
  }
  return null;
}

function programFor(pkg, files) {
  const tsconfig = findTsconfig(pkg.dir);
  const config = tsconfig ? ts.readConfigFile(tsconfig, ts.sys.readFile).config : {};
  const parsed = ts.parseJsonConfigFileContent(config, ts.sys, path.dirname(tsconfig ?? pkg.dir));
  const options = {
    ...parsed.options,
    noEmit: true,
    skipLibCheck: true,
    // The source door of every boundary package (epdf.devExports 'development'):
    // without it the checker follows a re-export into tsdown's hash-named dist
    // chunks — text that changes with the build and is absent on a bare checkout.
    customConditions: [...new Set([...(parsed.options.customConditions ?? []), 'development'])],
  };
  const host = ts.createCompilerHost(options);
  const cache = ts.createModuleResolutionCache(host.getCurrentDirectory(), host.getCanonicalFileName, options);
  // Same fold for imports inside the program: `export * from '@embedpdf/viewer'`
  // lands on the door's source, not on dist/doors/*.d.ts.
  host.resolveModuleNameLiterals = (literals, containingFile, redirectedReference, compilerOptions) =>
    literals.map((literal) => {
      const result = ts.resolveModuleName(literal.text, containingFile, compilerOptions, host, cache, redirectedReference);
      if (result.resolvedModule && isSource(result.resolvedModule.resolvedFileName)) return result;
      // Not source (or not resolvable at all, on a bare checkout): a workspace
      // package's subpath is read from its manifest, like the entries above.
      const named = workspaceSubpath(literal.text);
      const source = named && sourceOf(named.pkg, named.subpath);
      return source
        ? { ...result, resolvedModule: { resolvedFileName: source, extension: path.extname(source), isExternalLibraryImport: false } }
        : result;
    });
  return ts.createProgram(files, options, host);
}

/** Declaration text without comments or layout: what changes when the API changes, nothing else. */
function signatureText(decl) {
  return decl
    .getText()
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // block and doc comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1') // line comments (not URLs)
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,])\s*/g, '$1 ')
    .trim();
}

function describe(symbol, checker, source) {
  const target = symbol.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(symbol) : symbol;
  const decl = target.declarations?.[0];
  if (!decl) return `${symbol.name}: <unresolved>`;
  const kind = ts.SyntaxKind[decl.kind];
  const from = decl.getSourceFile() === source ? '' : ` (from ${path.relative(root, decl.getSourceFile().fileName)})`;
  return `${symbol.name} [${kind}]${from}: ${signatureText(decl)}`;
}

let drift = 0;
const packages = workspacePackages();
const workspaceDirs = new Set(packages.map((p) => p.dir));
const packagesByName = new Map(packages.map((p) => [p.name, p]));
for (const pkg of packages) {
  const entries = sourceEntries(pkg);
  if (entries.length === 0) continue;
  const program = programFor(pkg, entries.map((e) => e.file));
  const checker = program.getTypeChecker();
  for (const entry of entries) {
    const source = program.getSourceFile(entry.file);
    if (!source) continue;
    const moduleSymbol = checker.getSymbolAtLocation(source);
    if (!moduleSymbol) continue;
    const lines = checker.getExportsOfModule(moduleSymbol).map((s) => describe(s, checker, source)).sort();
    const next = `# ${pkg.name} — ${entry.subpath === 'index' ? '.' : './' + entry.subpath.replace(/__/g, '/')}\n\n${lines.join('\n')}\n`;
    const outFile = path.join(outRoot, pkg.name.replace('@', '').replace('/', '__'), `${entry.subpath}.api.txt`);
    if (check) {
      const prev = fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8') : null;
      if (prev !== next) {
        drift++;
        console.error(`API changed: ${path.relative(root, outFile)} (run: pnpm api:snapshot)`);
      }
    } else {
      fs.mkdirSync(path.dirname(outFile), { recursive: true });
      fs.writeFileSync(outFile, next);
    }
  }
}
if (check && drift > 0) {
  console.error(`\n${drift} public entry point(s) changed without an updated snapshot.`);
  process.exit(1);
}
if (!check) console.log(`API snapshots written to ${path.relative(root, outRoot)}/`);
