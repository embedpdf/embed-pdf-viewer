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
  for (const [subpath, target] of Object.entries(pkg.manifest.exports)) {
    const file =
      typeof target === 'string' ? target : (target?.development ?? target?.import ?? target?.default);
    if (typeof file !== 'string' || !/\.(ts|tsx)$/.test(file) || file.endsWith('.d.ts')) continue;
    entries.push({ subpath: subpath === '.' ? 'index' : subpath.replace(/^\.\//, '').replace(/\//g, '__'), file: path.join(pkg.dir, file) });
  }
  return entries;
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
  return ts.createProgram(files, { ...parsed.options, noEmit: true, skipLibCheck: true });
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
for (const pkg of workspacePackages()) {
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
