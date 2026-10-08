#!/usr/bin/env node
/**
 * The snippet check: each framework's snippets, compiled against the packages in this commit.
 *
 *   node scripts/snippets.mjs    compile, write generated/snippet-status.json, print a summary
 *
 * The pages describe the API the code is moving to, so most snippets don't compile yet. The check
 * says which do, per page and framework, and never fails; `publish-gate.mjs` reads it. React
 * compiles with `tsc`, Angular with `ngc` (`strictTemplates`), Vue with `vue-tsc`
 * (`strictTemplates`), Svelte with `svelte-check`; a tool that isn't installed, or misses an error
 * in the run's canary (`compile.mjs`), leaves its framework "not compiling".
 *
 * Two sets of pages, each compiled on its own: the headless docs, for four frameworks, and the
 * viewer's, for the same four and `vanilla`, a plain HTML page (`viewer.mjs` checks those, and the
 * code a viewer page shows itself).
 *
 * The snippets compile in a run directory that resolves every framework the embedpdf.com site has
 * (`compile.mjs`), each under the name its page shows (`search/search-box.tsx`) so they import
 * each other as written. Workspace packages resolve to their source. A helper a snippet
 * imports but doesn't show (`./pdf`, `./toast`) is the reader's own code: a typed stub from
 * `snippet-stubs/` when it feeds the viewer, an `any` stand-in otherwise, so a snippet's errors
 * are about our API.
 *
 * A page's snippets are its `<Snippet name>` tags, for the frameworks its `<Fw only>` blocks
 * allow, on either site: `<Engine>` versions differ only in the engine they create.
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
  repoRoot,
  runDirectory,
  toPosix,
  VIEWER_INTEGRATIONS,
  walk,
  writeJson,
  writeTsconfig,
} from './compile.mjs';
import {
  addInstallErrors,
  addMarkupErrors,
  exampleErrors,
  pageCodeErrors,
  stageVanilla,
} from './viewer.mjs';

const snippetsRoot = path.join(contentRoot, 'snippets');
const stubsRoot = path.join(contentRoot, 'scripts/snippet-stubs');
const statusFile = path.join(contentRoot, 'generated/snippet-status.json');

/** Errors kept per page and framework; the count says how many there were. */
const MAX_ERRORS = 20;

/**
 * The two sets of pages: where they are, the frameworks they're written for, the snippets they
 * show (`snippets/viewer/` is the viewer's), and the prefix their pages carry in the status.
 */
const DOCS = {
  headless: {
    root: 'headless',
    integrations: FRAMEWORKS,
    owns: (file) => !file.startsWith('viewer/'),
    prefix: '',
  },
  viewer: {
    root: 'viewer',
    integrations: VIEWER_INTEGRATIONS,
    owns: (file) => file.startsWith('viewer/'),
    prefix: 'viewer/',
  },
};

// ── the snippets and the pages that show them ───────────────────────────────

/**
 * Every snippet file: its framework, the name pages include it by, and the path the page shows.
 * A snippet is one file (`search/search-box.react.tsx`) or a directory of files, entry first
 * (`start/highlighter.vue/App.vue`). A viewer snippet can also be a plain HTML page
 * (`viewer/start/first.vanilla.html`), and an install command a shell file (`.react.sh`).
 */
function readSnippets() {
  return walk(snippetsRoot).flatMap((absolute) => {
    const file = toPosix(path.relative(snippetsRoot, absolute));
    const match = file.match(/^(.*)\.(react|vue|svelte|angular|vanilla)(\.[a-z]+$|\/)/);
    if (!match)
      throw new Error(`snippets/${file}: no framework in its name (<name>.<framework>.<ext>)`);
    const [, name, framework] = match;
    return [{ file, name, framework, shownAs: file.replace(`.${framework}`, '') }];
  });
}

/** `only="angular"` or `only={['react', 'vue']}` → the frameworks it names, of `integrations`. */
function frameworksIn(attributes, integrations) {
  const only = attributes.match(/only=(?:"([^"]*)"|\{([^}]*)\})/);
  if (!only) return integrations;
  return [...(only[1] ?? only[2]).matchAll(/[a-z]+/g)]
    .map(([word]) => word)
    .filter((word) => integrations.includes(word));
}

const TAGS = /<(\/?)(Fw|Snippet|Example|Engine)\b([^>]*)>/g;
const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w-]*)/;

/**
 * What one page shows, per framework: its `<Snippet>` and `<Example>` names, and its code blocks
 * with where each starts (`line`, the first line of code). A tag inside `<Fw only>` shows only
 * for the frameworks every enclosing block names; a code block in `<Engine>` without `local` is
 * the cloudpdf.com site's only (`local: false`). Tags inside a code block are code.
 */
export function readPage(mdx, integrations, where) {
  const shows = new Map(integrations.map((integration) => [integration, new Set()]));
  const examples = new Map(integrations.map((integration) => [integration, new Set()]));
  const code = [];
  const open = [];
  const allowed = () =>
    open.reduce(
      (list, scope) => (scope.only ? list.filter((fw) => scope.only.includes(fw)) : list),
      integrations,
    );

  let prose = [];
  const readProse = () => {
    for (const [tag, closing, element, attributes] of prose.join('\n').matchAll(TAGS)) {
      if (element === 'Fw' || element === 'Engine') {
        if (closing) open.pop();
        else if (!attributes.trim().endsWith('/')) {
          open.push(
            element === 'Fw'
              ? { only: frameworksIn(attributes, integrations) }
              : { local: /\blocal\b/.test(attributes) },
          );
        }
        continue;
      }
      const name = attributes.match(/name="([^"]+)"/)?.[1];
      if (!name) throw new Error(`${where}: ${tag} has no name`);
      for (const framework of allowed())
        (element === 'Snippet' ? shows : examples).get(framework).add(name);
    }
    prose = [];
  };

  const lines = mdx.split('\n');
  for (let index = 0; index < lines.length; index++) {
    const opening = lines[index].match(FENCE);
    if (!opening) {
      prose.push(lines[index]);
      continue;
    }
    readProse();
    const closes = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}\\s*$`);
    const body = [];
    let end = index + 1;
    while (end < lines.length && !closes.test(lines[end])) body.push(lines[end++]);
    code.push({
      lang: opening[2],
      line: index + 2,
      lines: body,
      integrations: allowed(),
      local: open.every((scope) => scope.local !== false),
    });
    index = end;
  }
  readProse();
  return { shows, examples, code, source: where };
}

/** Every page of a set, by the name the status gives it (`text/search`, `viewer/setup`). */
function readPages({ root, integrations, prefix }) {
  const pagesRoot = path.join(contentRoot, root);
  const pages = new Map();
  for (const absolute of walk(pagesRoot)
    .filter((file) => file.endsWith('.mdx'))
    .sort()) {
    const page = toPosix(path.relative(pagesRoot, absolute)).replace(/\.mdx$/, '');
    const where = `${root}/${page}.mdx`;
    pages.set(`${prefix}${page}`, readPage(fs.readFileSync(absolute, 'utf8'), integrations, where));
  }
  return pages;
}

// ── staging: the snippets, their helpers, a tsconfig ────────────────────────

/**
 * The imports of the reader's own modules in a file (relative, or SvelteKit's `$lib/`): static,
 * dynamic and re-exports, with what each one names.
 */
function ownImports(source) {
  const found = [];
  const clauses =
    /^[ \t]*(?:import|export)\s+(type\s+)?([^;'"]*?)\s+from\s+['"]((?:\.{1,2}|\$lib)\/[^'"]+)['"]/gm;
  for (const [, typeOnly, clause, specifier] of source.matchAll(clauses)) {
    const names = [];
    let rest = clause;
    const braces = clause.match(/\{([^}]*)\}/);
    if (braces) {
      rest = clause.replace(braces[0], '');
      for (const part of braces[1].split(',')) {
        const named = part.trim().match(/^(type\s+)?([\w$]+)/);
        if (named) names.push({ name: named[2], type: Boolean(typeOnly || named[1]) });
      }
    }
    const defaultName = rest
      .replace(/\*\s+as\s+[\w$]+/, '')
      .replace(/,/g, '')
      .trim();
    found.push({ specifier, names, default: Boolean(defaultName) && defaultName !== '*' });
  }
  for (const [, specifier] of source.matchAll(
    /\bimport\(\s*['"]((?:\.{1,2}|\$lib)\/[^'"]+)['"]\s*\)/g,
  )) {
    found.push({ specifier, names: [], default: true });
  }
  return found;
}

const EXTENSIONS = ['', '.ts', '.tsx', '.d.ts', '/index.ts'];
/** Whether an import resolves to a staged file; `./helper.js` names `helper.ts` too. */
const resolves = (target) =>
  [target, target.replace(/\.js$/, '')].some((base) =>
    EXTENSIONS.some((extension) => fs.existsSync(`${base}${extension}`)),
  );

const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
const isComponentName = (name) => /^[A-Z]/.test(name);

/**
 * An Angular helper component the reader wrote: `PasswordForm` is `<app-password-form>`, with the
 * inputs and outputs the snippets bind on it, so `strictTemplates` has nothing to say about it.
 */
function angularComponentStandIn(name, templates) {
  const selector = `app-${kebab(name)}`;
  const inputs = new Set();
  const outputs = new Set();
  for (const template of templates) {
    for (const [, attributes] of template.matchAll(new RegExp(`<${selector}\\b([^>]*)>`, 'g'))) {
      // Binding names only: `[value]="values[key]"` binds `value`, not `key`.
      const names = attributes.replace(/"[^"]*"|'[^']*'/g, '""');
      for (const [, twoWay, input, output] of names.matchAll(
        /\[\(([\w$]+)\)\]|\[([\w$.]+)\]|\(([\w$.]+)\)/g,
      )) {
        if (twoWay) {
          inputs.add(twoWay);
          outputs.add(`${twoWay}Change`);
        } else if (input && !input.includes('.')) inputs.add(input);
        // `(keydown.enter)` is a DOM event on the host, not an output.
        else if (output && !output.includes('.')) outputs.add(output);
      }
    }
  }
  return [
    `@Component({ selector: '${selector}', template: '<ng-content />' })`,
    `export class ${name} {`,
    ...[...inputs].map((input) => `  @Input() ${input}: any;`),
    ...[...outputs].map((output) => `  @Output() ${output} = new EventEmitter<any>();`),
    '}',
  ].join('\n');
}

/** What the snippets import from one helper: its values, its types, and whether a default. */
function importedNames(uses) {
  const values = new Set();
  const types = new Set();
  let hasDefault = false;
  for (const use of uses) {
    hasDefault ||= use.default;
    for (const { name, type } of use.names) (type ? types : values).add(name);
  }
  return { values, types, hasDefault };
}

const STAND_IN_HEADER = "// A stand-in for the reader's own code (scripts/snippets.mjs).";
const DEFAULT_EXPORT = ['declare const standIn: any;', 'export default standIn;'];

/** An `any` stand-in for a TypeScript helper: every value and type it's asked for. */
function moduleStandIn(uses) {
  const { values, types, hasDefault } = importedNames(uses);
  const lines = [STAND_IN_HEADER];
  for (const name of values) {
    lines.push(`export declare const ${name}: any;`);
    // `<Spinner />` is a value, `Spinner` in a type position a type: a capital name is both.
    if (isComponentName(name)) types.add(name);
  }
  for (const name of types) lines.push(`export type ${name} = any;`);
  if (hasDefault) lines.push(...DEFAULT_EXPORT);
  return `${lines.join('\n')}\n`;
}

/**
 * An Angular helper: a component when a snippet lists it in `imports`, a service when it's
 * another class, and `any` otherwise. Angular reads `imports` statically, so they're real classes.
 */
function angularStandIn(uses, importers) {
  const { values, types, hasDefault } = importedNames(uses);
  const listed = importers.flatMap((source) =>
    [...source.matchAll(/\bimports:\s*\[([^\]]*)\]/g)].flatMap(
      ([, list]) => list.match(/[\w$]+/g) ?? [],
    ),
  );
  const templates = importers.flatMap((source) =>
    [...source.matchAll(/\btemplate:\s*`([^`]*)`/g)].map(([, template]) => template),
  );
  const lines = [
    STAND_IN_HEADER,
    "import { Component, EventEmitter, Injectable, Input, Output } from '@angular/core';",
  ];
  for (const name of values) {
    if (listed.includes(name)) lines.push(angularComponentStandIn(name, templates));
    else if (isComponentName(name)) {
      lines.push(
        `@Injectable({ providedIn: 'root' })`,
        `export class ${name} { [key: string]: any }`,
      );
    } else lines.push(`export declare const ${name}: any;`);
  }
  // A class is a type already.
  for (const name of types) if (!values.has(name)) lines.push(`export type ${name} = any;`);
  if (hasDefault) lines.push(...DEFAULT_EXPORT);
  return `${lines.join('\n')}\n`;
}

const VUE_STAND_IN = `<!-- A stand-in for the reader's own component (scripts/snippets.mjs). -->
<script setup lang="ts">
defineProps<Record<string, any>>();
</script>

<template><slot /></template>
`;

const SVELTE_STAND_IN = `<!-- A stand-in for the reader's own component (scripts/snippets.mjs). -->
<script lang="ts">
  let { children }: { children?: import('svelte').Snippet; [prop: string]: any } = $props();
</script>

{@render children?.()}
`;

/**
 * Write a stub or a stand-in for every helper the staged files at `staged` import but nobody
 * shows. A `.svelte` import of names is a Svelte module (`versions.svelte.ts`), not a component.
 */
function writeHelpers(framework, root, staged) {
  fs.cpSync(stubsRoot, path.join(root, '_stubs'), { recursive: true });
  const stubs = new Set(fs.readdirSync(stubsRoot).map((file) => file.replace(/\.ts$/, '')));

  const helpers = new Map();
  for (const file of staged) {
    const source = fs.readFileSync(file, 'utf8');
    for (const use of ownImports(source)) {
      const target = use.specifier.startsWith('$lib/')
        ? path.join(root, '_lib', use.specifier.slice('$lib/'.length))
        : path.resolve(path.dirname(file), use.specifier);
      if (resolves(target)) continue;
      const helper = helpers.get(target) ?? { uses: [], importers: [] };
      helper.uses.push(use);
      helper.importers.push(source);
      helpers.set(target, helper);
    }
  }
  for (const [target, { uses, importers }] of helpers) {
    const bare = target.replace(/\.js$/, '');
    const stub = path.basename(bare);
    const component = uses.every((use) => use.names.length === 0);
    let file = `${bare}.ts`;
    let contents;
    if (target.endsWith('.vue')) [file, contents] = [target, VUE_STAND_IN];
    else if (target.endsWith('.svelte') && component) [file, contents] = [target, SVELTE_STAND_IN];
    else if (stubs.has(stub)) {
      const from = toPosix(path.relative(path.dirname(bare), path.join(root, '_stubs', stub)));
      contents = `export * from '${from.startsWith('.') ? from : `./${from}`}';\n`;
    } else {
      contents = framework === 'angular' ? angularStandIn(uses, importers) : moduleStandIn(uses);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
}

/** The files each framework's tsconfig compiles: the snippets, their helpers and stand-ins. */
const INCLUDE = {
  react: ['**/*.ts', '**/*.tsx'],
  angular: ['**/*.ts'],
  vue: ['**/*.ts', '**/*.vue'],
  svelte: ['**/*.ts', '**/*.svelte'],
  vanilla: ['**/*.ts', '**/*.js'],
};

/**
 * A snippet is part of the reader's app, which may use a component without importing it (a
 * global one, or Nuxt's `<ClientOnly>` and auto-imports), so an unknown Vue component isn't an
 * error here. The components it does import are still checked, props and events included; a
 * complete example (`samples.mjs`) gets no such leeway.
 */
const OVERRIDES = { vue: { vueCompilerOptions: { checkUnknownComponents: false } } };

/**
 * Copy one framework's snippets to `root` (in a run directory) under the names the pages show,
 * write a stub or a stand-in for every helper they import but don't show, and a tsconfig (which,
 * with `viewer`, reads `@embedpdf/viewer` at its source). Returns where each staged snippet came
 * from.
 */
function stage(framework, snippets, root, { viewer = false } = {}) {
  const origins = new Map();
  for (const snippet of snippets.filter((s) => s.framework === framework)) {
    const staged = path.join(root, snippet.shownAs);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.copyFileSync(path.join(snippetsRoot, snippet.file), staged);
    origins.set(staged, snippet.file);
  }
  writeHelpers(framework, root, [...origins.keys()]);
  writeTsconfig(framework, root, INCLUDE[framework], OVERRIDES[framework], { viewer });
  return { root, origins };
}

// ── compiling ───────────────────────────────────────────────────────────────

/**
 * A compiler's diagnostics, sorted by where they point: a snippet (by its file under
 * `snippets/`), or the check's own files (a stub, a stand-in, the tsconfig). One in a package the
 * snippets import is that package's own check's business. A staged file that `locate`s its lines
 * (`viewer.mjs`) says where in its page a diagnostic is, or that it's in the check's own text.
 */
function sortDiagnostics(
  diagnostics,
  { root, origins, locate = new Map(), ignores = () => false },
) {
  const bySnippet = new Map();
  const ownFiles = [];
  const own = (absolute, line, message) => {
    const where = absolute ? toPosix(path.relative(repoRoot, absolute)) : '(compiler options)';
    ownFiles.push(`${where}${line ? `:${line}` : ''}: ${message}`);
  };
  for (const diagnostic of diagnostics) {
    const { file: absolute, line, column, message } = diagnostic;
    const snippet = absolute && origins.get(absolute);
    if (snippet) {
      const at = locate.has(absolute) ? locate.get(absolute)(line, column) : { line, column };
      if (!at) own(absolute, line, message);
      else if (!ignores(snippet, diagnostic)) {
        const errors = bySnippet.get(snippet) ?? [];
        errors.push({ file: snippet, line: at.line, column: at.column, message });
        bySnippet.set(snippet, errors);
      }
    } else if (!absolute || absolute.startsWith(`${root}${path.sep}`)) {
      own(absolute, line, message);
    }
  }
  return { bySnippet, ownFiles };
}

/**
 * Compile one framework's staged files and sort what the compiler says. An error in a stub or a
 * stand-in means the check can't vouch for any snippet: the framework isn't compiling, with why.
 */
async function compileStaged(framework, staged) {
  const started = performance.now();
  let result = await compile(framework, staged.root);
  if (result.tool) {
    result = { ...result, ...sortDiagnostics(result.diagnostics, staged) };
    if (result.ownFiles.length) {
      result = {
        ...result,
        tool: null,
        reason: `the check's own files don't compile (${result.ownFiles[0]})`,
      };
    }
  }
  return { ...result, seconds: (performance.now() - started) / 1000 };
}

// ── the status ──────────────────────────────────────────────────────────────

/**
 * The errors of the snippets one page shows for one framework. A snippet with no file for the
 * framework counts as an error: the page shows "This code isn't written for <Framework> yet" in
 * its place.
 */
function snippetErrors(names, framework, snippets, result) {
  const errors = [];
  for (const name of [...names].sort()) {
    const files = snippets.filter((s) => s.framework === framework && s.name === name);
    if (files.length === 0) {
      errors.push({ snippet: name, message: `no ${FRAMEWORK_LABELS[framework]} version` });
    } else if (!result.tool) {
      errors.push({ snippet: name, message: result.reason });
    } else {
      for (const { file } of files) {
        for (const error of result.bySnippet.get(file) ?? [])
          errors.push({ snippet: name, ...error });
      }
    }
  }
  return errors;
}

/** A page's status for one framework: compiles, or the first errors and how many there were. */
const statusOf = (errors) =>
  errors.length
    ? { compiles: false, errorCount: errors.length, errors: errors.slice(0, MAX_ERRORS) }
    : { compiles: true };

/** Per headless page and framework: whether every snippet the page shows compiles. */
function pageStatus(pages, snippets, results) {
  const status = {};
  for (const [page, { shows }] of pages) {
    status[page] = {};
    for (const framework of FRAMEWORKS) {
      status[page][framework] = statusOf(
        snippetErrors(shows.get(framework), framework, snippets, results[framework]),
      );
    }
  }
  return status;
}

function printSummary(title, status, results, snippets, pages, integrations) {
  const pageCount = Object.keys(status).length;
  console.log(`${title} (${snippets.length} files, ${pageCount} pages):`);
  for (const framework of integrations) {
    const result = results[framework];
    const compiling = Object.values(status).filter((page) => page[framework].compiles).length;
    const how = result.tool
      ? `${result.tool}, ${result.seconds.toFixed(1)}s`
      : `not compiling: ${result.reason}`;
    console.log(
      `  ${FRAMEWORK_LABELS[framework].padEnd(10)} ${String(compiling).padStart(2)} of ${pageCount} pages compile (${how})`,
    );
  }
  const shown = new Set(
    [...pages.values()].flatMap(({ shows }) => [...shows.values()].flatMap((names) => [...names])),
  );
  const unused = [...new Set(snippets.map((s) => s.name))].filter((name) => !shown.has(name));
  if (unused.length) console.log(`  ${unused.length} snippets no page shows: ${unused.join(', ')}`);
}

/** The compilers' verdicts, as the status file records them. */
const verdicts = (results, integrations) =>
  Object.fromEntries(
    integrations.map((framework) => {
      const { tool, reason } = results[framework];
      return [framework, tool ? { tool } : { tool: null, reason }];
    }),
  );

/** Compile the headless snippets, one framework at a time. */
async function checkHeadless(runRoot, snippets, pages) {
  const results = {};
  for (const framework of FRAMEWORKS) {
    results[framework] = await compileStaged(
      framework,
      stage(framework, snippets, path.join(runRoot, framework)),
    );
  }
  return { results, status: pageStatus(pages, snippets, results) };
}

/**
 * Compile the viewer's snippets: the frameworks' against `@embedpdf/viewer` at its source, and
 * the plain HTML pages, with the code the pages show themselves (`viewer.mjs`).
 */
async function checkViewer(runRoot, snippets, pages) {
  const results = {};
  for (const framework of FRAMEWORKS) {
    const root = path.join(runRoot, `viewer-${framework}`);
    results[framework] = await compileStaged(
      framework,
      stage(framework, snippets, root, { viewer: true }),
    );
  }
  results.vanilla = await checkVanilla(snippets, pages, path.join(runRoot, 'viewer-vanilla'));
  addInstallErrors(snippets, results);
  return { results, status: viewerPageStatus(pages, snippets, results) };
}

/**
 * Compile the viewer's plain-HTML snippets and the code its pages show (`viewer.mjs`) in `root`,
 * the snippets read from `snippetsRoot`.
 */
export async function checkVanilla(snippets, pages, root, snippetsRoot) {
  const vanilla = stageVanilla(snippets, pages, root, snippetsRoot);
  writeHelpers('vanilla', vanilla.root, [...vanilla.origins.keys()]);
  writeTsconfig('vanilla', vanilla.root, INCLUDE.vanilla, {}, { viewer: true });
  const result = await compileStaged('vanilla', vanilla);
  addMarkupErrors(result, vanilla.markup);
  return result;
}

/**
 * Per viewer page and framework: whether every snippet and example the page shows is there and
 * compiles, and whether the code the page shows itself compiles (for every framework: the config
 * is the same in each).
 */
function viewerPageStatus(pages, snippets, results) {
  const status = {};
  for (const [page, shown] of pages) {
    status[page] = {};
    for (const framework of VIEWER_INTEGRATIONS) {
      status[page][framework] = statusOf([
        ...snippetErrors(shown.shows.get(framework), framework, snippets, results[framework]),
        ...exampleErrors(shown.examples.get(framework), framework),
        ...pageCodeErrors(shown, framework, results.vanilla),
      ]);
    }
  }
  return status;
}

/**
 * Compile every framework's snippets, write `generated/snippet-status.json` and print a summary.
 * Returns the status: `frameworks` and `pages` for the headless docs, and `viewer` with the same
 * two for the viewer's (its pages named `viewer/setup`). Snippets that don't compile never fail
 * it; a compiler that crashes leaves its framework "not compiling", with why.
 */
export async function checkSnippets() {
  const started = performance.now();
  const snippets = readSnippets();
  const headlessSnippets = snippets.filter((s) => DOCS.headless.owns(s.file));
  const viewerSnippets = snippets.filter((s) => DOCS.viewer.owns(s.file));
  const headlessPages = readPages(DOCS.headless);
  const viewerPages = readPages(DOCS.viewer);

  // One directory per run, so both sites' builds can check at the same time.
  const runRoot = runDirectory('embedpdf-snippets');
  let headless;
  let viewer;
  try {
    headless = await checkHeadless(runRoot, headlessSnippets, headlessPages);
    viewer = await checkViewer(runRoot, viewerSnippets, viewerPages);
  } finally {
    removeRunDirectory(runRoot);
  }

  const status = {
    frameworks: verdicts(headless.results, FRAMEWORKS),
    pages: headless.status,
    viewer: {
      frameworks: verdicts(viewer.results, VIEWER_INTEGRATIONS),
      pages: viewer.status,
    },
  };
  writeJson(statusFile, status);
  const seconds = (performance.now() - started) / 1000;
  console.log(`Snippets, ${seconds.toFixed(1)}s:`);
  printSummary(
    'Headless',
    status.pages,
    headless.results,
    headlessSnippets,
    headlessPages,
    FRAMEWORKS,
  );
  printSummary(
    'Viewer',
    status.viewer.pages,
    viewer.results,
    viewerSnippets,
    viewerPages,
    VIEWER_INTEGRATIONS,
  );
  console.log(`Wrote ${path.relative(process.cwd(), statusFile) || statusFile}.`);
  return status;
}

export { writeJson };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await checkSnippets();
