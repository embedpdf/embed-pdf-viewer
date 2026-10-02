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
  walk,
  writeJson,
  writeTsconfig,
} from './compile.mjs';

const snippetsRoot = path.join(contentRoot, 'snippets');
const headlessRoot = path.join(contentRoot, 'headless');
const stubsRoot = path.join(contentRoot, 'scripts/snippet-stubs');
const statusFile = path.join(contentRoot, 'generated/snippet-status.json');

/** Errors kept per page and framework; the count says how many there were. */
const MAX_ERRORS = 20;

// ── the snippets and the pages that show them ───────────────────────────────

/**
 * Every snippet file: its framework, the name pages include it by, and the path the page shows.
 * A snippet is one file (`search/search-box.react.tsx`) or a directory of files, entry first
 * (`start/highlighter.vue/App.vue`).
 */
function readSnippets() {
  return walk(snippetsRoot).map((absolute) => {
    const file = toPosix(path.relative(snippetsRoot, absolute));
    const match = file.match(/^(.*)\.(react|vue|svelte|angular)(\.[a-z]+$|\/)/);
    if (!match)
      throw new Error(`snippets/${file}: no framework in its name (<name>.<framework>.<ext>)`);
    const [, name, framework] = match;
    return { file, name, framework, shownAs: file.replace(`.${framework}`, '') };
  });
}

/** `only="angular"` or `only={['react', 'vue']}` → the frameworks it names. */
function frameworksIn(attributes) {
  const only = attributes.match(/only=(?:"([^"]*)"|\{([^}]*)\})/);
  if (!only) return FRAMEWORKS;
  return [...(only[1] ?? only[2]).matchAll(/[a-z]+/g)]
    .map(([word]) => word)
    .filter((word) => FRAMEWORKS.includes(word));
}

/**
 * Which snippets each headless page shows, per framework. A `<Snippet>` inside `<Fw only>` shows
 * only for the frameworks every enclosing block names.
 */
function readPages() {
  const pages = new Map();
  for (const absolute of walk(headlessRoot)
    .filter((file) => file.endsWith('.mdx'))
    .sort()) {
    const page = toPosix(path.relative(headlessRoot, absolute)).replace(/\.mdx$/, '');
    const mdx = fs.readFileSync(absolute, 'utf8');
    const shows = new Map(FRAMEWORKS.map((framework) => [framework, new Set()]));
    const open = [];
    for (const [tag, closing, element, attributes] of mdx.matchAll(
      /<(\/?)(Fw|Snippet)\b([^>]*)>/g,
    )) {
      if (element === 'Fw') {
        if (closing) open.pop();
        else if (!attributes.trim().endsWith('/')) open.push(frameworksIn(attributes));
        continue;
      }
      const name = attributes.match(/name="([^"]+)"/)?.[1];
      if (!name) throw new Error(`headless/${page}.mdx: ${tag} has no name`);
      const allowed = open.reduce(
        (frameworks, only) => frameworks.filter((fw) => only.includes(fw)),
        FRAMEWORKS,
      );
      for (const framework of allowed) shows.get(framework).add(name);
    }
    pages.set(page, shows);
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
const resolves = (target) => EXTENSIONS.some((extension) => fs.existsSync(`${target}${extension}`));

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

/** The files each framework's tsconfig compiles: the snippets, their helpers and stand-ins. */
const INCLUDE = {
  react: ['**/*.ts', '**/*.tsx'],
  angular: ['**/*.ts'],
  vue: ['**/*.ts', '**/*.vue'],
  svelte: ['**/*.ts', '**/*.svelte'],
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
 * write a stub or a stand-in for every helper they import but don't show, and a tsconfig. Returns
 * where each staged snippet came from.
 */
function stage(framework, snippets, root) {
  const origins = new Map();
  for (const snippet of snippets.filter((s) => s.framework === framework)) {
    const staged = path.join(root, snippet.shownAs);
    fs.mkdirSync(path.dirname(staged), { recursive: true });
    fs.copyFileSync(path.join(snippetsRoot, snippet.file), staged);
    origins.set(staged, snippet.file);
  }

  fs.cpSync(stubsRoot, path.join(root, '_stubs'), { recursive: true });
  const stubs = new Set(fs.readdirSync(stubsRoot).map((file) => file.replace(/\.ts$/, '')));

  const helpers = new Map();
  for (const staged of origins.keys()) {
    const source = fs.readFileSync(staged, 'utf8');
    for (const use of ownImports(source)) {
      const target = use.specifier.startsWith('$lib/')
        ? path.join(root, '_lib', use.specifier.slice('$lib/'.length))
        : path.resolve(path.dirname(staged), use.specifier);
      if (resolves(target)) continue;
      const helper = helpers.get(target) ?? { uses: [], importers: [] };
      helper.uses.push(use);
      helper.importers.push(source);
      helpers.set(target, helper);
    }
  }
  for (const [target, { uses, importers }] of helpers) {
    const stub = path.basename(target);
    let file = `${target}.ts`;
    let contents;
    if (target.endsWith('.vue')) [file, contents] = [target, VUE_STAND_IN];
    else if (target.endsWith('.svelte')) [file, contents] = [target, SVELTE_STAND_IN];
    else if (stubs.has(stub)) {
      const from = toPosix(path.relative(path.dirname(target), path.join(root, '_stubs', stub)));
      contents = `export * from '${from.startsWith('.') ? from : `./${from}`}';\n`;
    } else {
      contents = framework === 'angular' ? angularStandIn(uses, importers) : moduleStandIn(uses);
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }

  writeTsconfig(framework, root, INCLUDE[framework], OVERRIDES[framework]);
  return { root, origins };
}

// ── compiling ───────────────────────────────────────────────────────────────

/**
 * A compiler's diagnostics, sorted by where they point: a snippet (by its file under
 * `snippets/`), or the check's own files (a stub, a stand-in, the tsconfig). One in a package the
 * snippets import is that package's own check's business.
 */
function sortDiagnostics(diagnostics, { root, origins }) {
  const bySnippet = new Map();
  const ownFiles = [];
  for (const { file: absolute, line, column, message } of diagnostics) {
    const snippet = absolute && origins.get(absolute);
    if (snippet) {
      const errors = bySnippet.get(snippet) ?? [];
      errors.push({ file: snippet, line, column, message });
      bySnippet.set(snippet, errors);
    } else if (!absolute || absolute.startsWith(`${root}${path.sep}`)) {
      const where = absolute ? toPosix(path.relative(repoRoot, absolute)) : '(compiler options)';
      ownFiles.push(`${where}${line ? `:${line}` : ''}: ${message}`);
    }
  }
  return { bySnippet, ownFiles };
}

// ── the status ──────────────────────────────────────────────────────────────

/**
 * Per page and framework: whether every snippet the page shows compiles, and the errors when one
 * doesn't. A snippet with no file for the framework counts as an error: the page shows "This code
 * isn't written for <Framework> yet" in its place.
 */
function pageStatus(pages, snippets, results) {
  const status = {};
  for (const [page, shows] of pages) {
    status[page] = {};
    for (const framework of FRAMEWORKS) {
      const result = results[framework];
      const errors = [];
      for (const name of [...shows.get(framework)].sort()) {
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
      status[page][framework] = errors.length
        ? { compiles: false, errorCount: errors.length, errors: errors.slice(0, MAX_ERRORS) }
        : { compiles: true };
    }
  }
  return status;
}

function printSummary(status, results, snippets, pages, seconds) {
  const pageCount = Object.keys(status).length;
  console.log(`Snippets (${snippets.length} files, ${pageCount} pages, ${seconds.toFixed(1)}s):`);
  for (const framework of FRAMEWORKS) {
    const result = results[framework];
    const compiling = Object.values(status).filter((page) => page[framework].compiles).length;
    const how = result.tool
      ? `${result.tool}, ${result.seconds.toFixed(1)}s`
      : `not compiling: ${result.reason}`;
    console.log(
      `  ${FRAMEWORK_LABELS[framework].padEnd(8)} ${String(compiling).padStart(2)} of ${pageCount} pages compile (${how})`,
    );
  }
  const shown = new Set(
    [...pages.values()].flatMap((shows) => [...shows.values()].flatMap((names) => [...names])),
  );
  const unused = [...new Set(snippets.map((s) => s.name))].filter((name) => !shown.has(name));
  if (unused.length) console.log(`  ${unused.length} snippets no page shows: ${unused.join(', ')}`);
  console.log(`Wrote ${path.relative(process.cwd(), statusFile) || statusFile}.`);
}

/**
 * Compile every framework's snippets, write `generated/snippet-status.json` and print a summary.
 * Returns the status. Snippets that don't compile never fail it; a compiler that crashes leaves
 * its framework "not compiling", with why.
 */
export async function checkSnippets() {
  const started = performance.now();
  const snippets = readSnippets();
  const pages = readPages();

  // One directory per run, so both sites' builds can check at the same time.
  const runRoot = runDirectory('embedpdf-snippets');
  const results = {};
  try {
    for (const framework of FRAMEWORKS) {
      const frameworkStarted = performance.now();
      const staged = stage(framework, snippets, path.join(runRoot, framework));
      let result = await compile(framework, staged.root);
      if (result.tool) {
        result = { ...result, ...sortDiagnostics(result.diagnostics, staged) };
        // An error in a stub or a stand-in means the check can't vouch for any snippet.
        if (result.ownFiles.length) {
          result = {
            ...result,
            tool: null,
            reason: `the check's own files don't compile (${result.ownFiles[0]})`,
          };
        }
      }
      results[framework] = { ...result, seconds: (performance.now() - frameworkStarted) / 1000 };
    }
  } finally {
    removeRunDirectory(runRoot);
  }

  const status = {
    frameworks: Object.fromEntries(
      FRAMEWORKS.map((framework) => {
        const { tool, reason } = results[framework];
        return [framework, tool ? { tool } : { tool: null, reason }];
      }),
    ),
    pages: pageStatus(pages, snippets, results),
  };
  writeJson(statusFile, status);
  printSummary(status.pages, results, snippets, pages, (performance.now() - started) / 1000);
  return status;
}

export { writeJson };

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await checkSnippets();
