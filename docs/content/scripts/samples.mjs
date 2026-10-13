#!/usr/bin/env node
/**
 * The example check: the live examples under `samples/`, compiled straight from here against the
 * packages in this commit, without syncing them into a site or starting one.
 *
 *   node scripts/samples.mjs                every example; exit 1 on an error
 *   node scripts/samples.mjs search stage   only the examples of these areas
 *   node scripts/samples.mjs viewer         only the ready-made viewer's
 *   node scripts/samples.mjs --root <dir>   a site's synced copy instead (`src/samples`)
 *
 * Unlike a snippet, an example is a complete app that runs on its page, so every one must compile:
 * nothing stands in for a missing helper, and an error fails the check. React examples compile
 * with `tsc`, Angular ones with `ngc` (`strictTemplates`), Vue ones with `vue-tsc`
 * (`strictTemplates`) and Svelte ones with `svelte-check`. Each run gets its own directory
 * (`compile.mjs`), so several checks of different areas can run at the same time.
 *
 * The ready-made viewer's examples (`samples/viewer/`) compile as the snippet check compiles the
 * viewer's snippets: against `@embedpdf/viewer` at its source, for the four frameworks and
 * `vanilla`, a plain HTML page (`<name>.vanilla.html`), whose module scripts are taken out of the
 * page and checked as JavaScript, and whose elements are checked against the viewer's
 * (`viewer.mjs`).
 *
 * By default it checks examples as they are written, for the local engine. A site checks what it
 * ships with `--root src/samples` (its `check:samples`): the synced copy, the cloud form included,
 * in every framework. A synced copy's `snippets/` belong to the snippet check.
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
  VIEWER_INTEGRATIONS,
  walk,
  writeTsconfig,
} from './compile.mjs';
import { ENGINES } from '../engines.mjs';
import { addMarkupErrors, stageVanilla } from './viewer.mjs';

/** Where the examples are: here, or a site's synced copy (`--root`). */
let samplesRoot = path.join(contentRoot, 'samples');

/** A synced copy's snippets: not examples. */
const NOT_EXAMPLES = new Set(['snippets']);

/** The ready-made viewer's examples, which compile against the viewer, in five integrations. */
const VIEWER = 'viewer';

/**
 * How each framework's examples are named: one file, `<name>.<framework>.<ext>`, or a directory
 * of them, `<name>.<framework>/` with `App.<ext>` first. A plain-HTML page is one file. The
 * tsconfig compiles exactly those.
 */
const EXTENSIONS = { react: 'tsx', vue: 'vue', svelte: 'svelte', angular: 'ts', vanilla: 'html' };

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
 * Copy the areas a pass compiles (every headless area, or the viewer's) to `root`, so an
 * example's relative imports work wherever they point, with a tsconfig for one framework. Only
 * the areas being checked report errors.
 */
function stage(framework, root, { viewer = false } = {}) {
  fs.cpSync(samplesRoot, root, {
    recursive: true,
    filter: (source) => {
      const relative = path.relative(samplesRoot, source);
      // The directory itself, and the files beside the areas (`samples-env.d.ts`).
      if (!relative || (!relative.includes(path.sep) && fs.statSync(source).isFile())) return true;
      const area = relative.split(path.sep)[0];
      return !NOT_EXAMPLES.has(area) && (area === VIEWER) === viewer;
    },
  });
  writeTsconfig(framework, root, include(framework), {}, { viewer });
}

/** Where a staged file came from, as the docs name it: `samples/search/search-box.react.tsx`. */
const sourceName = (root, file) => toPosix(path.join('samples', path.relative(root, file)));

/** One framework's compile: how many examples, its errors (`{ where, message }`), or why not. */
async function checkFramework(framework, areas, runRoot, { viewer }) {
  const examples = new Set(
    areas
      .flatMap((area) => walk(path.join(samplesRoot, area)))
      .map((file) => exampleOf(file, framework))
      .filter(Boolean),
  );
  if (examples.size === 0) return null;
  const root = path.join(runRoot, `${viewer ? 'viewer-' : ''}${framework}`);
  const inArea = (file) => areas.includes(path.relative(root, file).split(path.sep)[0]);
  stage(framework, root, { viewer });
  const result = await compile(framework, root, inArea);
  if (!result.tool) return { examples: examples.size, ...result };
  // A compiler that can't narrow to the areas reports on every example: keep theirs.
  const errors = result.diagnostics
    .filter(({ file }) => !file || inArea(file))
    .map(({ file, line, column, message }) => ({
      where: file ? `${sourceName(root, file)}:${line}:${column}` : '(compiler options)',
      message,
    }));
  return { examples: examples.size, tool: result.tool, errors };
}

/**
 * The viewer's plain-HTML examples, compiled as the snippet check compiles the viewer's plain-HTML
 * snippets (`viewer.mjs`): each module script on its own at the page's line numbers, and the
 * elements and attributes the page uses, against its site's viewer. A per-site page
 * (`<name>.cloud.vanilla.html`) is its site's; the others are the site's whose copy this is
 * (`viewer.mjs` tells), embedpdf.com's as written.
 */
async function checkVanilla(runRoot) {
  const pages = walk(path.join(samplesRoot, VIEWER))
    .map((file) => toPosix(path.relative(samplesRoot, file)))
    .filter((file) => /\.vanilla(\.|\/)/.test(file));
  if (pages.length === 0) return null;
  const directories = pages.filter((file) => !file.endsWith('.vanilla.html'));
  if (directories.length) {
    return {
      examples: pages.length,
      tool: 'the example check',
      errors: directories.map((file) => ({
        where: `samples/${file}`,
        message: 'a plain-HTML example is one page: `<name>.vanilla.html`',
      })),
    };
  }
  const bySite = Map.groupBy(pages, (file) => {
    const flavor = file.match(/\.(\w+)\.vanilla\.html$/)?.[1];
    return flavor && ENGINES[flavor] ? flavor : null;
  });
  const errors = [];
  let tool = null;
  for (const [engine, files] of bySite) {
    const examples = files.map((file) => ({
      file,
      name: file.replace(/\.vanilla\.html$/, ''),
      framework: 'vanilla',
    }));
    const root = path.join(runRoot, `viewer-vanilla${engine ? `-${engine}` : ''}`);
    const staged = stageVanilla(examples, new Map(), root, samplesRoot, engine ? { engine } : {});
    writeTsconfig('vanilla', root, ['**/*.ts', '**/*.js'], {}, { viewer: true });
    const result = await compile('vanilla', root);
    if (!result.tool) return { examples: pages.length, ...result };
    tool = result.tool;
    for (const { file, line, column, message } of result.diagnostics) {
      const origin = file && staged.origins.get(file);
      const at = origin ? staged.locate.get(file)(line, column) : null;
      if (at) errors.push({ where: `samples/${origin}:${at.line}:${at.column}`, message });
      else {
        const own = file ? `${toPosix(path.relative(root, file))}:${line}` : '(compiler options)';
        errors.push({ where: `the check's own ${own}`, message });
      }
    }
    const markup = { tool, bySnippet: new Map() };
    addMarkupErrors(markup, staged.markup);
    for (const [file, list] of markup.bySnippet) {
      for (const { line, column, message } of list) {
        errors.push({ where: `samples/${file}:${line}:${column}`, message });
      }
    }
  }
  return { examples: pages.length, tool, errors };
}

export async function checkSamples(argv = []) {
  const started = performance.now();
  const rootFlag = argv.indexOf('--root');
  if (rootFlag !== -1) {
    samplesRoot = path.resolve(argv[rootFlag + 1]);
    argv = argv.filter((_, index) => index !== rootFlag && index !== rootFlag + 1);
  }
  const areas = areasToCheck(argv);
  const headless = areas.filter((area) => area !== VIEWER);
  const viewer = areas.includes(VIEWER) ? [VIEWER] : [];
  const runRoot = runDirectory('embedpdf-samples');
  let failed = false;
  const report = (label, outcome) => {
    if (!outcome) return;
    if (!outcome.tool) {
      failed = true;
      console.error(`  ${label} not checked: ${outcome.reason}`);
      return;
    }
    const { examples, errors, tool } = outcome;
    console.log(
      `  ${label} ${examples} examples, ${errors.length ? `${errors.length} errors` : 'all compile'} (${tool})`,
    );
    for (const { where, message } of errors) console.error(`    ${where}  ${message}`);
    failed ||= errors.length > 0;
  };
  try {
    if (headless.length) {
      for (const framework of FRAMEWORKS) {
        const outcome = await checkFramework(framework, headless, runRoot, { viewer: false });
        report(FRAMEWORK_LABELS[framework].padEnd(8), outcome);
      }
    }
    if (viewer.length) {
      for (const integration of VIEWER_INTEGRATIONS) {
        const outcome =
          integration === 'vanilla'
            ? await checkVanilla(runRoot)
            : await checkFramework(integration, viewer, runRoot, { viewer: true });
        report(`Viewer, ${FRAMEWORK_LABELS[integration]}`.padEnd(18), outcome);
      }
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
