#!/usr/bin/env node
/**
 * The example check: the live examples under `samples/`, compiled straight from here against the
 * packages in this commit, without syncing them into a site or starting one.
 *
 *   node scripts/samples.mjs                every example; exit 1 on an error
 *   node scripts/samples.mjs search stage   only the examples of these areas
 *
 * Unlike a snippet, an example is a complete app that runs on its page, so every one must compile:
 * nothing stands in for a missing helper, and an error fails the check. React examples compile
 * with `tsc`, Angular ones with `ngc` (`strictTemplates`). Each run gets its own directory
 * (`compile.mjs`), so several checks of different areas can run at the same time.
 *
 * It checks examples as they are written, for the local engine. The sites still check what they
 * ship: `check:samples` compiles each site's synced copy, the cloud form included. The ready-made
 * viewer's samples (`samples/viewer/`) belong to the viewer docs, and Vue and Svelte examples wait
 * for `vue-tsc` and `svelte-check` in the site.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  COMPILER_OPTIONS,
  compileWithNgc,
  compileWithTsc,
  contentRoot,
  resolvePaths,
  runDirectory,
  toPosix,
  walk,
} from './compile.mjs';

const samplesRoot = path.join(contentRoot, 'samples');

/** The viewer docs' samples, which this check leaves to the viewer. */
const NOT_EXAMPLES = new Set(['viewer']);

/** How each framework's examples are named, and compiled. */
const FRAMEWORKS = {
  react: {
    label: 'React',
    isExample: (file) => /\.react\.tsx$|\.react\/.+\.tsx?$/.test(file),
    include: ['**/*.react.tsx', '**/*.react/**/*', 'samples-env.d.ts'],
    compilerOptions: { jsx: 'react-jsx' },
    compile: compileWithTsc,
  },
  angular: {
    label: 'Angular',
    isExample: (file) => /\.angular\.ts$|\.angular\/.+\.ts$/.test(file),
    include: ['**/*.angular.ts', '**/*.angular/**/*.ts', 'samples-env.d.ts'],
    compilerOptions: { experimentalDecorators: true, useDefineForClassFields: false },
    angularCompilerOptions: { strictTemplates: true },
    compile: compileWithNgc,
  },
};

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
  const { include, compilerOptions, angularCompilerOptions } = FRAMEWORKS[framework];
  const tsconfig = {
    compilerOptions: { ...COMPILER_OPTIONS, ...compilerOptions, paths: resolvePaths() },
    include,
    ...(angularCompilerOptions ? { angularCompilerOptions } : {}),
  };
  fs.writeFileSync(path.join(root, 'tsconfig.json'), `${JSON.stringify(tsconfig, null, 2)}\n`);
}

/** Where a staged file came from, as the docs name it: `samples/search/search-box.react.tsx`. */
const sourceName = (root, file) => toPosix(path.join('samples', path.relative(root, file)));

export async function checkSamples(argv = []) {
  const started = performance.now();
  const areas = areasToCheck(argv);
  const inArea = (root, file) => areas.includes(path.relative(root, file).split(path.sep)[0]);
  const runRoot = runDirectory('embedpdf-samples');
  let failed = false;
  try {
    for (const [framework, { label, isExample, compile }] of Object.entries(FRAMEWORKS)) {
      const examples = areas.flatMap((area) =>
        walk(path.join(samplesRoot, area)).filter((file) => isExample(toPosix(file))),
      );
      if (examples.length === 0) continue;
      const root = path.join(runRoot, framework);
      stage(framework, root);
      const result = await compile(root, (file) => inArea(root, file));
      if (!result.tool) {
        failed = true;
        console.error(`  ${label.padEnd(8)} not checked: ${result.reason}`);
        continue;
      }
      const errors = result.diagnostics.filter(
        ({ file }) => !file || inArea(root, path.resolve(root, file)),
      );
      console.log(
        `  ${label.padEnd(8)} ${examples.length} examples, ${errors.length ? `${errors.length} errors` : 'all compile'} (${result.tool})`,
      );
      for (const { file, line, column, message } of errors) {
        const where = file
          ? `${sourceName(root, path.resolve(root, file))}:${line}:${column}`
          : '(compiler options)';
        console.error(`    ${where}  ${message}`);
      }
      failed ||= errors.length > 0;
    }
  } finally {
    fs.rmSync(runRoot, { recursive: true, force: true });
  }
  const unchecked = areas.flatMap((area) =>
    walk(path.join(samplesRoot, area)).filter((file) => /\.(vue|svelte)$/.test(file)),
  );
  if (unchecked.length) {
    console.log(
      `  ${unchecked.length} Vue and Svelte examples aren't checked yet (no vue-tsc or svelte-check in website/)`,
    );
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
