#!/usr/bin/env node
/**
 * Package READMEs, written from the docs (docs/conventions/docs-architecture.md, "Package READMEs").
 *
 *   tsx scripts/readmes.mjs                       write the README of every package `../readmes.mjs` lists
 *   tsx scripts/readmes.mjs --engine local|cloud  only one site's packages: `@embedpdf/*` or `@cloudpdf/*`
 *   tsx scripts/readmes.mjs --check               write nothing, and fail on a README that isn't current
 *
 * A README is a frame (`../readme/installed.md`) filled from two places: the package's own
 * `package.json` (its name, description and license), and the page that documents the package,
 * as the package's site shows it for one framework, with a section of a second page where the
 * manifest names one (`also`). The page and its code are read from
 * `docs/content` the way the snippet check reads them (`sync.mjs`), so nothing needs syncing
 * first, and go through the docs kit's Markdown pass (`renderDocsReadmeWith`), which takes the
 * part of the page a README shows. Every sentence of a README is the page's, the package's or
 * the frame's: this script writes none.
 *
 * A page that names something its code doesn't have yet (`publish-gate.mjs`) holds its README
 * back, as it holds the page back on the site: the README is then its frame without the page's
 * part. That is read from committed files only, so a README is the same text on every machine.
 *
 * Runs with `tsx`, since the kit is TypeScript.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { frameworkHref } from '../../kit/mdx/frameworks.mjs';
import { renderDocsReadmeWith } from '../../kit/src/docs-markdown.ts';
import { DOCUMENT_SITES } from '../documents.mjs';
import { ENGINES } from '../engines.mjs';
import { READMES } from '../readmes.mjs';
import { VIEWER_PENDING } from '../viewer-pending.mjs';
import {
  FRAMEWORK_LABELS,
  FRAMEWORKS,
  repoRoot,
  toPosix,
  VIEWER_INTEGRATIONS,
  walk,
  workspacePackages,
} from './compile.mjs';
import { pendingByPage } from './publish-gate.mjs';
import { fillFrame, linkProblems, proseOf, sizeOf, wordingProblems } from './readme-text.mjs';
import { sitePages, siteSamples } from './sync.mjs';

/** The first line of every README this script writes, naming the pages it is cut from. No reader sees it. */
const marker = (pages) =>
  `<!-- Generated from ${pages.join(' and ')} by docs/content/scripts/readmes.mjs. Edit there, then run \`pnpm readme:sync\`. -->`;

/** The docs sections the corpus holds, with the integrations each one's pages are shown for. */
const SECTIONS = { headless: FRAMEWORKS, viewer: VIEWER_INTEGRATIONS, engine: [] };

/** Each site's folder, where the pages it writes itself are (`src/content/docs`). */
const SITE_DIRS = { local: 'website', cloud: 'cloudpdf/website' };

/** The site a package's README is written for, by the scope of its engine: `@embedpdf` is `local`. */
const ENGINE_BY_SCOPE = Object.fromEntries(
  Object.entries(ENGINES).map(([engine, { package: name }]) => [name.split('/')[0], engine]),
);

/** The entry of an example that is a directory of files: the code view shows it first. */
const ENTRY_FILES = { react: 'App.tsx', vue: 'App.vue', svelte: 'App.svelte', angular: 'app.ts' };

function parseArgs(argv) {
  const args = { check: false, engine: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--check') args.check = true;
    else if (argv[i] === '--engine') args.engine = argv[++i];
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (args.engine && !(args.engine in ENGINES)) {
    throw new Error(`--engine must be one of: ${Object.keys(ENGINES).join(', ')}`);
  }
  return args;
}

/** One value per key, made the first time it is asked for. */
function once(make) {
  const made = new Map();
  return (key) => {
    if (!made.has(key)) made.set(key, make(key));
    return made.get(key);
  };
}

// ── a page as its site shows it ─────────────────────────────────────────────

/** `headless/viewing/stage` → the section the page is in, and its name there. */
function pageId(page) {
  const [section, ...rest] = page.split('/');
  return { section, name: rest.join('/') };
}

/** A URL path under `/docs`, from the parts of a page's path: an `index` is its folder's page. */
function docsPath(...parts) {
  const route = parts.flatMap((part) => (part ?? '').split('/')).filter(Boolean);
  if (route.at(-1) === 'index') route.pop();
  return ['/docs', ...route].join('/');
}

/** A page's URL path on its site; `headless/quick-start` for React is `/docs/headless/react/quick-start`. */
const pagePath = (section, name, integration) => docsPath(section, integration, name);

/** A site's pages of one section, by name: `pagesOf('local')('headless').get('quick-start')`. */
const pagesOf = once((engine) =>
  once((section) => new Map(sitePages(section, engine).map((page) => [page.name, page]))),
);

/**
 * Every URL path under `/docs` a site answers: each page of the corpus, with and without the
 * integration it is shown for, and the pages the site writes itself.
 */
const docsRoutes = once((engine) => {
  const routes = new Set(['/docs']);
  for (const [section, integrations] of Object.entries(SECTIONS)) {
    for (const name of pagesOf(engine)(section).keys()) {
      for (const integration of [null, ...integrations]) {
        routes.add(pagePath(section, name, integration));
      }
    }
  }
  const own = path.join(repoRoot, SITE_DIRS[engine], 'src/content/docs');
  for (const file of walk(own).map((absolute) => toPosix(path.relative(own, absolute)))) {
    if (!file.endsWith('.mdx') || file.split('/')[0] in SECTIONS) continue;
    routes.add(docsPath(file.slice(0, -'.mdx'.length)));
  }
  return routes;
});

/** The URL paths the docs site at `origin` answers, or nothing for any other origin. */
function docsRoutesAt(origin) {
  const engine = Object.keys(DOCUMENT_SITES).find((key) => DOCUMENT_SITES[key] === origin);
  return engine && docsRoutes(engine);
}

/** The pending names each headless page lists (`publish-gate.mjs`), read when first asked for. */
let pendingNames;

/** Whether a page names something its code doesn't have yet, which holds it back on the site. */
function namesPending({ section, name }) {
  if (section === 'headless') {
    pendingNames ??= pendingByPage();
    return (pendingNames.get(name)?.size ?? 0) > 0;
  }
  if (section === 'viewer') return Object.keys(VIEWER_PENDING[name] ?? {}).length > 0;
  return false;
}

// ── the code a page shows ───────────────────────────────────────────────────

/**
 * The files an example (`getting-started/basic`) or a snippet (`snippets/start/save-button`)
 * shows for one integration, in the order the page's code view has them
 * (docs/conventions/docs-architecture.md, "An example in each framework"): its one file, named
 * without the integration, or the files of its directory, entry first; then the example's
 * stylesheet, after the first file. `samples` is the site's (`siteSamples`).
 */
function exampleFiles(samples, name, integration) {
  const file = (shown, filename) => ({
    filename,
    code: samples.get(shown),
    language: path.extname(shown).slice(1),
  });
  const unit = `${name}.${integration}`;
  const entry = ENTRY_FILES[integration];
  const inDirectory = [...samples.keys()]
    .filter((shown) => shown.startsWith(`${unit}/`) && !shown.slice(unit.length + 1).includes('/'))
    .map((shown) => file(shown, path.posix.basename(shown)))
    .sort((a, b) =>
      a.filename === entry ? -1 : b.filename === entry ? 1 : a.filename.localeCompare(b.filename),
    );
  const files = inDirectory.length
    ? inDirectory
    : [...samples.keys()]
        .filter((shown) => shown.startsWith(`${unit}.`) && !shown.slice(unit.length).includes('/'))
        .sort()
        .map((shown) => file(shown, path.posix.basename(shown).replace(`.${integration}.`, '.')));
  if (files.length === 0) return [];
  const stylesheet = `${name}.css`;
  return samples.has(stylesheet)
    ? [files[0], file(stylesheet, path.posix.basename(stylesheet)), ...files.slice(1)]
    : files;
}

/** The docs kit's view of one site, reading the corpus where a site reads its synced copy. */
const siteOf = once((engine) => {
  const samples = siteSamples(engine);
  return {
    siteOrigin: DOCUMENT_SITES[engine],
    engine,
    resolveExampleFiles: (name, integration) => {
      const files = exampleFiles(samples, name, integration);
      // The kit would say so in a sentence of its own. A README has none of those.
      if (files.length === 0) {
        throw new Error(`${name} isn't written for ${FRAMEWORK_LABELS[integration]}`);
      }
      return files;
    },
    // A file shown by its path is a site's own page's; the corpus has no such page.
    readCodeFile: () => null,
    isFramework: (value) => VIEWER_INTEGRATIONS.includes(value),
    variantLabel: (integration) => FRAMEWORK_LABELS[integration] ?? integration,
    // The kit keeps a framework's reader in that framework; this does it for a plain HTML page too.
    resolveContentHref: (url, integration) => (integration ? frameworkHref(url, integration) : url),
  };
});

// ── a README ────────────────────────────────────────────────────────────────

/** A frame, by the kind of package it is for: its path in the repository and its text. */
const frameOf = once((kind) => {
  const file = `docs/content/readme/${kind}.md`;
  return { file, text: fs.readFileSync(path.join(repoRoot, file), 'utf8') };
});

/**
 * A page a README shows part of, on the package's site and for the README's framework:
 * `{ id, source, mdx, integration, canonicalPath }`, or the `problem` with what the manifest
 * names. A page that isn't shown per framework (an engine page) takes none.
 */
function pageFor(name, engine, pageName, framework) {
  const id = pageId(pageName);
  const page = SECTIONS[id.section] && pagesOf(engine)(id.section).get(id.name);
  if (!page) {
    return { problem: `readmes.mjs: ${name} names ${pageName}, which is no page of its site` };
  }
  const integrations = SECTIONS[id.section];
  if (integrations.length && !integrations.includes(framework)) {
    const shown = `is shown for one \`framework\` of ${integrations.join(', ')}`;
    return { problem: `readmes.mjs: ${name}: a page under ${id.section}/ ${shown}` };
  }
  const integration = integrations.length ? framework : undefined;
  return {
    id,
    source: `docs/content/${page.source}`,
    mdx: page.mdx,
    integration,
    canonicalPath: pagePath(id.section, id.name, integration),
  };
}

/**
 * One package's README, and what is wrong with it: `{ file, text, problems }`, or only the
 * problems when there is nothing to write.
 */
export function readmeOf(name, entry, packages) {
  const engine = ENGINE_BY_SCOPE[name.split('/')[0]];
  const listed = packages.get(name);
  if (!engine || !listed?.published) {
    return { problems: [`readmes.mjs: ${name} isn't a package this repository publishes`] };
  }
  const { directory, manifest } = listed;
  const file = `${directory}/README.md`;
  const manifestFile = `${directory}/package.json`;

  const page = pageFor(name, engine, entry.page, entry.framework);
  const also = entry.also && pageFor(name, engine, entry.also.page, entry.framework);
  const unknown = [page, also].flatMap((named) => (named?.problem ? [named.problem] : []));
  if (!page.problem && entry.framework && !page.integration) {
    unknown.push(
      `readmes.mjs: ${name}: a page under ${page.id.section}/ is shown for no framework`,
    );
  }
  if (unknown.length) return { problems: unknown };

  /** What the kit reads from one of the two pages; a page it can't read is the README's problem. */
  const read = ({ source, mdx, integration, canonicalPath }, options) => {
    try {
      const site = siteOf(engine);
      return renderDocsReadmeWith(site, {
        sourceCode: mdx,
        canonicalPath,
        integration,
        ...options,
      });
    } catch (error) {
      throw new Error(`${source}, as ${name}'s README: ${error.message}`, { cause: error });
    }
  };
  let parts;
  let section;
  try {
    parts = read(page, { section: entry.section });
    section = also && read(also, { section: entry.also.section, withHeading: true });
  } catch (error) {
    return { problems: [error.message] };
  }

  // A page that is held back on the site has no part in a README either.
  const shownOf = (named, cut) => (namesPending(named.id) ? '' : cut);
  const slots = {
    name,
    description: manifest.description?.trim() ?? '',
    license: manifest.license ?? '',
    pageTitle: parts.title ?? '',
    pageDescription: parts.description ?? '',
    pageUrl: `${DOCUMENT_SITES[engine]}${page.canonicalPath}`,
    cut: shownOf(page, parts.cut),
    also: section ? shownOf(also, section.cut) : '',
    nextSteps: parts.nextSteps,
  };

  const problems = [];
  if (!slots.description) problems.push(`${manifestFile} has no description`);
  if (!slots.license) problems.push(`${manifestFile} has no license`);
  if (!slots.pageTitle) problems.push(`${page.source} has no title`);
  if (!slots.pageDescription) problems.push(`${page.source} has no description`);
  for (const problem of wordingProblems(slots.description)) {
    problems.push(`${manifestFile}: its description ${problem}`);
  }
  const frame = frameOf('installed');
  for (const problem of wordingProblems(frame.text)) problems.push(`${frame.file} ${problem}`);
  const shown = [
    [page, [slots.pageTitle, slots.pageDescription, slots.cut, slots.nextSteps].join('\n')],
    ...(also ? [[also, slots.also]] : []),
  ];
  for (const [{ source }, text] of shown) {
    for (const problem of wordingProblems(proseOf(text))) {
      problems.push(`${source} ${problem}, in what ${name}'s README shows of it`);
    }
  }

  const sources = shown.map(([{ source }]) => source);
  const text = `${marker(sources)}\n\n${fillFrame(frame.text, slots)}`;
  for (const problem of linkProblems(text, docsRoutesAt)) {
    problems.push(`${file}: ${problem} (${sources.join(', ')})`);
  }
  return { file, text, problems };
}

function main() {
  const args = parseArgs(process.argv);
  const packages = workspacePackages();
  const readmes = Object.entries(READMES)
    .filter(([name]) => !args.engine || ENGINE_BY_SCOPE[name.split('/')[0]] === args.engine)
    .map(([name, entry]) => readmeOf(name, entry, packages));

  const problems = readmes.flatMap((readme) => readme.problems);
  if (problems.length) {
    console.error("Package READMEs can't be written:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }

  const stale = readmes.filter(({ file, text }) => {
    try {
      return fs.readFileSync(path.join(repoRoot, file), 'utf8') !== text;
    } catch {
      return true;
    }
  });
  if (args.check && stale.length) {
    console.error('Package READMEs are stale:');
    for (const { file } of stale) console.error(`- ${file}`);
    console.error('Run: pnpm readme:sync');
    process.exit(1);
  }
  for (const { file, text } of stale) fs.writeFileSync(path.join(repoRoot, file), text);

  // Each README's size and the code it shows, so one that grew is seen where it is reviewed.
  for (const { file, text } of readmes) {
    const { lines, code } = sizeOf(text);
    const shown = code.map((block) => `${block.shows} ${block.lines}`).join(', ');
    console.log(`  ${file}: ${lines} lines${shown ? ` (code: ${shown})` : ''}`);
  }
  const scope = args.engine ? `, engine=${args.engine}` : '';
  console.log(
    args.check
      ? `Package READMEs are current (${readmes.length}${scope}).`
      : `Wrote ${stale.length} of ${readmes.length} package READMEs${scope}.`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
