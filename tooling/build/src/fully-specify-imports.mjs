#!/usr/bin/env node
/**
 * Finishes a framework package's `dist` (Vue, Svelte): every relative import ends in the file it
 * means, the way Node, strict bundlers (webpack, for a `"type": "module"` package) and
 * TypeScript's `node16` resolution need it. `./stage/scope` becomes `./stage/scope.js`,
 * `./stage/Stage.vue` (declared by `Stage.vue.d.ts`) becomes `./stage/Stage.vue.js`, `..` becomes
 * `../index.js`.
 *
 * These packages are built by their platforms' own tools (Vite and vue-tsc, svelte-package), which
 * keep each import as the source writes it: extensionless, like the rest of the repo. The packages
 * on the tsdown preset (`preset.ts`) get this from tsdown.
 *
 * `--cjs-types` also writes a `.d.cts` next to every `.d.ts`, its imports ending in `.cjs`, so the
 * types a `require` finds are CommonJS, like the `.cjs` files they describe. Without them,
 * TypeScript reads the `.d.ts` files of a `"type": "module"` package as ES modules for a `require`
 * too, and a CommonJS consumer's types are wrong.
 *
 *   node ../../../tooling/build/src/fully-specify-imports.mjs [--cjs-types]   # in the package
 */
import fs from 'node:fs';
import path from 'node:path';
import { importsIn, walk } from './package-files.mjs';

const dist = path.resolve('dist');
const cjsTypes = process.argv.includes('--cjs-types');

const isFile = (file) => fs.statSync(file, { throwIfNoEntry: false })?.isFile() ?? false;
const isRelative = (specifier) =>
  specifier === '.' || specifier === '..' || /^\.\.?\//.test(specifier);

/**
 * The fully specified form of `specifier`, imported from `file`: the file itself when it exists
 * (a chunk, a `.svelte` component), else its `.js` (built, or declared by a `.d.ts`), else its
 * folder's `index.js`.
 */
function fullySpecified(specifier, file) {
  const target = path.resolve(path.dirname(file), specifier);
  const declared = (base) => isFile(`${base}.js`) || isFile(`${base}.d.ts`);
  if (isFile(target)) return specifier;
  if (specifier.endsWith('.js') && isFile(target.replace(/\.js$/, '.d.ts'))) return specifier;
  if (declared(target)) return `${specifier}.js`;
  if (declared(path.join(target, 'index'))) return `${specifier.replace(/\/$/, '')}/index.js`;
  throw new Error(
    `${path.relative(dist, file)}: "${specifier}" names no file in dist to fully specify it with`,
  );
}

/** `code` with each relative import replaced by `replace(specifier)`, back to front. */
function rewriteImports(code, file, replace) {
  let next = code;
  for (const { specifier, start, end } of importsIn(code, file).reverse()) {
    if (isRelative(specifier)) next = next.slice(0, start) + replace(specifier) + next.slice(end);
  }
  return next;
}

if (!fs.existsSync(dist)) {
  console.error(`fully-specify-imports: no dist in ${process.cwd()}; build first`);
  process.exit(1);
}

const files = walk(dist);
let changed = 0;
for (const file of files.filter((name) => /\.(js|d\.ts|svelte)$/.test(name))) {
  const code = fs.readFileSync(file, 'utf8');
  const next = rewriteImports(code, file, (specifier) => fullySpecified(specifier, file));
  if (next !== code) {
    fs.writeFileSync(file, next);
    changed += 1;
  }
}

let twins = 0;
if (cjsTypes) {
  for (const file of files.filter((name) => name.endsWith('.d.ts'))) {
    const code = fs.readFileSync(file, 'utf8');
    const cjs = rewriteImports(code, file, (specifier) => specifier.replace(/\.js$/, '.cjs'));
    fs.writeFileSync(file.replace(/\.d\.ts$/, '.d.cts'), cjs);
    twins += 1;
  }
}

console.log(
  `fully-specify-imports: ${changed} files rewritten` +
    (cjsTypes ? `, ${twins} CommonJS declarations written` : ''),
);
