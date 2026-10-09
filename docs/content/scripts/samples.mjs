#!/usr/bin/env node
/**
 * The example check: the live examples under `samples/`, compiled straight from here against the
 * packages in this commit, without syncing them into a site or starting one.
 *
 *   node scripts/samples.mjs                every example; exit 1 on an error
 *   node scripts/samples.mjs search stage   only the examples of these areas
 *   node scripts/samples.mjs --root <dir>   a site's synced copy instead (`src/samples`)
 *
 * Unlike a snippet, an example is a complete app that runs on its page, so every one must compile:
 * nothing stands in for a missing helper, and an error fails the check. React examples compile
 * with `tsc`, Angular ones with `ngc` (`strictTemplates`), Vue ones with `vue-tsc`
 * (`strictTemplates`) and Svelte ones with `svelte-check`. Each run gets its own directory
 * (`compile.mjs`), so several checks of different areas can run at the same time.
 *
 * By default it checks examples as they are written, for the local engine. A site checks what it
 * ships with `--root src/samples` (its `check:samples`): the synced copy, the cloud form included,
 * in every framework. The ready-made viewer's samples (`samples/viewer/`) belong to the viewer
 * docs, and a synced copy's `snippets/` to the snippet check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compile,
  contentRoot,
  FRAMEWORK_LABELS,
  FRAMEWORKS,
  removeRunDirectory,
  runDirectory,
  toPosix,
  walk,
  writeTsconfig,
} from './compile.mjs';

/** Where the examples are: here, or a site's synced copy (`--root`). */
let samplesRoot = path.join(contentRoot, 'samples');

/** The viewer docs' samples, and a synced copy's snippets: not examples. */
const NOT_EXAMPLES = new Set(['viewer', 'snippets']);

/**
 * How each framework's examples are named: one file, `<name>.<framework>.<ext>`, or a directory
 * of them, `<name>.<framework>/` with `App.<ext>` first. The tsconfig compiles exactly those.
 */
const EXTENSIONS = { react: 'tsx', vue: 'vue', svelte: 'svelte', angular: 'ts' };

const include = (framework) => [
  `**/*.${framework}.${EXTENSIONS[framework]}`,
  `**/*.${framework}/**/*`,
  'samples-env.d.ts',
];

/** The example a file belongs to (`search/basic.vue`), or null if it isn't a `framework` one. */
function exampleOf(file, framework) {
  const match = toPosix(path.relative(samplesRoot, file)).match(
    new RegExp(`^(.+\\.${framework})(?:\\.${EXTENSIONS[framework]}$|/.+\\.[a-z]+$)`),
  );
  return match ? match[1] : null;
}

/** The areas to check: the ones named on the command line, or every one. */
function areasToCheck(argv) {
  const all = fs
    .readdirSync(samplesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && !NOT_EXAMPLES.has(entry.name))
    .map((entry) => entry.name);
  const named = argv.filter((arg) => !arg.startsWith('-'));
  const unknown = named.filter((area) => !all.includes(area));
  if (unknown.length) {
    throw new Error(`no examples in ${unknown.join(', ')}; the areas are ${all.join(', ')}`);
  }
  return named.length ? named : all;
}

/**
 * Copy every area's examples to `root`, so an example's relative imports work wherever they point,
 * with a tsconfig for one framework. Only the areas being checked report errors.
 */
function stage(framework, root) {
  fs.cpSync(samplesRoot, root, {
    recursive: true,
    filter: (source) => !NOT_EXAMPLES.has(path.relative(samplesRoot, source).split(path.sep)[0]),
  });
  writeTsconfig(framework, root, include(framework));
}

/** Where a staged file came from, as the docs name it: `samples/search/search-box.react.tsx`. */
const sourceName = (root, file) => toPosix(path.join('samples', path.relative(root, file)));

export async function checkSamples(argv = []) {
  const started = performance.now();
  const rootFlag = argv.indexOf('--root');
  if (rootFlag !== -1) {
    samplesRoot = path.resolve(argv[rootFlag + 1]);
    argv = argv.filter((_, index) => index !== rootFlag && index !== rootFlag + 1);
  }
  const areas = areasToCheck(argv);
  const inArea = (root, file) => areas.includes(path.relative(root, file).split(path.sep)[0]);
  const runRoot = runDirectory('embedpdf-samples');
  let failed = false;
  try {
    for (const framework of FRAMEWORKS) {
      const label = FRAMEWORK_LABELS[framework];
      const examples = new Set(
        areas
          .flatMap((area) => walk(path.join(samplesRoot, area)))
          .map((file) => exampleOf(file, framework))
          .filter(Boolean),
      );
      if (examples.size === 0) continue;
      const root = path.join(runRoot, framework);
      stage(framework, root);
      const result = await compile(framework, root, (file) => inArea(root, file));
      if (!result.tool) {
        failed = true;
        console.error(`  ${label.padEnd(8)} not checked: ${result.reason}`);
        continue;
      }
      // A compiler that can't narrow to the areas reports on every example: keep theirs.
      const errors = result.diagnostics.filter(({ file }) => !file || inArea(root, file));
      console.log(
        `  ${label.padEnd(8)} ${examples.size} examples, ${errors.length ? `${errors.length} errors` : 'all compile'} (${result.tool})`,
      );
      for (const { file, line, column, message } of errors) {
        const where = file ? `${sourceName(root, file)}:${line}:${column}` : '(compiler options)';
        console.error(`    ${where}  ${message}`);
      }
      failed ||= errors.length > 0;
    }
  } finally {
    removeRunDirectory(runRoot);
  }
  console.log(
    `Examples in ${areas.join(', ')}: ${((performance.now() - started) / 1000).toFixed(1)}s`,
  );
  return !failed;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const ok = await checkSamples(process.argv.slice(2));
  process.exit(ok ? 0 : 1);
}
