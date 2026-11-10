#!/usr/bin/env node
/**
 * Mount the shared docs corpus into a site (docs/conventions/docs-architecture.md).
 *
 *   node scripts/sync.mjs --target <site dir> --engine local|cloud [--frameworks react,...] [--check]
 *
 * MDX pages copy verbatim (the site's remark pipeline resolves `<Engine>`
 * blocks at compile time) — except rung 3 of the fork ladder: a sibling
 * `page.<flavor>.mdx` wins over `page.mdx` for that flavor. Every emitted
 * page carries a generated marker; `_meta.ts` files get a comment header.
 *
 * Samples emit per flavor: the engine import/factory lines swap from
 * `engines.mjs`, each `// [!doc-source <key>]` block swaps to the
 * flavor's form from `documents.mjs`, each `// [!doc-range <key> <name>]`
 * block gets the flavor's characters of that document (`swapDocRanges`), each
 * demo document's full URL names the flavor's own site (`swapDocumentSite`), and
 * a `// [!asset-engine]` block (the browser-side engine a stamp library opens
 * on) swaps to the flavor's
 * `assetEngine` — the document's own engine locally, a local engine beside
 * the cloud one on the cloud site. Sample files carry NO marker (they are
 * displayed verbatim in docs code panels); the drift check is their guard.
 *
 * The ready-made viewer's files (its samples, `snippets/viewer/`, and the code blocks of its
 * pages) provision no engine: the viewer owns it. A flavor's copy names its own viewer instead
 * (`swapViewer`): the packages, the CDN script and its default import from `engines.mjs`, and
 * each document the code gives as `src` from `documents.mjs`. What a swap can't say is a per-site
 * file: `name.<flavor>.<integration>.<ext>` (or a directory `name.<flavor>.<integration>/`)
 * replaces `name.<integration>.<ext>` on that flavor's site and is left out of the others, as a
 * `page.<flavor>.mdx` replaces `page.mdx`.
 *
 * The generator OWNS the target directories: anything there it did not emit
 * is deleted (or fails `--check`). Site-local pages don't belong in them.
 *
 * `--check` also runs the headless reference check (`reference.mjs`): the pages
 * list every public member of every plugin, and nothing the code doesn't have.
 * Then it compiles the snippets and writes which pages are live, per site
 * (`publish-gate.mjs`), which the site's build reads. That part only reports: a
 * snippet that doesn't compile holds its page back, never the build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEMO_DOCUMENTS, DOCUMENT_SITES } from '../documents.mjs';
import { ENGINES } from '../engines.mjs';
import { writePublishStatus } from './publish-gate.mjs';
import { checkReference } from './reference.mjs';

const contentRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const MDX_MARKER = '{/* Generated from docs/content — edit there, then `pnpm docs:sync`. */}';
const META_MARKER = '// Generated from docs/content — edit there, then `pnpm docs:sync`.';
const FLAVORS = Object.keys(ENGINES);
const ALL_FRAMEWORKS = ['react', 'vue', 'svelte', 'angular'];
/** The integrations a file can be written for: the frameworks, and `vanilla`, a plain HTML page. */
const INTEGRATIONS = [...ALL_FRAMEWORKS, 'vanilla'];

/** corpus section → site subpath (relative to the site dir). */
const MOUNTS = {
  mdx: [
    { from: 'headless', to: 'src/content/docs/headless' },
    // The whole engine corpus. Onboarding that differs per engine is a
    // flavored page (`setup.local.mdx` / `setup.cloud.mdx`) or a page with
    // `engines: [cloud]`, not a site-owned file.
    // Its code imports from the local package; each flavor's copy imports
    // from its own (`swapEngineImports`).
    { from: 'engine', to: 'src/content/docs/engine', swapsEngineImports: true },
    // Its code blocks name the local viewer; each flavor's copy names its own (`swapViewer`).
    { from: 'viewer', to: 'src/content/docs/viewer', swapsViewer: true },
  ],
  // Every folder of live examples (samples/<area>/), so a new area needs no entry here.
  samples: [
    ...fs
      .readdirSync(path.join(contentRoot, 'samples'), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => ({
        from: `samples/${entry.name}`,
        to: `src/samples/${entry.name}`,
        viewer: () => entry.name === 'viewer',
      })),
    // Code-only snippets, one file per framework (<Snippet name>); demos never build them.
    {
      from: 'snippets',
      to: 'src/samples/snippets',
      viewer: (relative) => relative.startsWith('viewer/'),
    },
  ],
};

function parseArgs(argv) {
  const args = { check: false, frameworks: ALL_FRAMEWORKS };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--target') args.target = path.resolve(argv[++i]);
    else if (argv[i] === '--engine') args.engine = argv[++i];
    else if (argv[i] === '--frameworks') args.frameworks = argv[++i].split(',');
    else if (argv[i] === '--check') args.check = true;
    else throw new Error(`Unknown argument: ${argv[i]}`);
  }
  if (!args.target) throw new Error('Missing --target <site dir>');
  if (!FLAVORS.includes(args.engine)) {
    throw new Error(`--engine must be one of: ${FLAVORS.join(', ')}`);
  }
  return args;
}

function walk(directory) {
  let entries = [];
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries.flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(absolute) : [absolute];
  });
}

const toPosix = (file) => file.split(path.sep).join('/');
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The integration a sample or snippet is written for: a framework, `vanilla`, or none (a stylesheet). */
const integrationOf = (relative) =>
  relative.match(new RegExp(`\\.(${INTEGRATIONS.join('|')})(\\.|\\/|$)`))?.[1] ?? null;

// ── per-site files ──────────────────────────────────────────────────────────

/**
 * What a sample or snippet path is: its unit (`start/first.vanilla`, the file or directory one
 * integration's version is), the flavor of a per-site file (`start/first.cloud.vanilla.html`),
 * and the path a site gets it under, the flavor taken out. Null for a file of no integration.
 */
function variantOf(relative) {
  const match = relative.match(
    new RegExp(
      `^(.*?)(?:\\.(${FLAVORS.join('|')}))?\\.(${INTEGRATIONS.join('|')})((?:\\.[a-z]+$)|(?:\\/.*$))`,
    ),
  );
  if (!match) return null;
  const [, name, flavor = null, integration, rest] = match;
  return {
    unit: `${name}.${integration}`,
    flavor,
    integration,
    emitAs: `${name}.${integration}${rest}`,
  };
}

/**
 * The files of one samples or snippets tree a flavor's site gets, as `{ source, emitAs }`: a
 * per-site file for that flavor under its plain name, in place of the shared one; nothing of
 * another flavor's.
 */
export function siteFiles(relatives, engine) {
  const own = new Set(
    relatives.flatMap((relative) => {
      const variant = variantOf(relative);
      return variant?.flavor === engine ? [variant.unit] : [];
    }),
  );
  return relatives.flatMap((relative) => {
    const variant = variantOf(relative);
    if (!variant) return [{ source: relative, emitAs: relative }];
    if (variant.flavor)
      return variant.flavor === engine ? [{ source: relative, emitAs: variant.emitAs }] : [];
    return own.has(variant.unit) ? [] : [{ source: relative, emitAs: relative }];
  });
}

// ── pages ───────────────────────────────────────────────────────────────────

/** rung 3: `page.<flavor>.mdx` beats `page.mdx` for that flavor. */
function resolveMdxOverride(files, relative, engine) {
  const base = relative.replace(/\.mdx$/, '');
  const flavorMatch = base.match(/\.(\w+)$/);
  if (flavorMatch && FLAVORS.includes(flavorMatch[1])) {
    // A flavored page: emit (under its base name) only for its own flavor.
    return flavorMatch[1] === engine ? `${base.slice(0, -flavorMatch[1].length - 1)}.mdx` : null;
  }
  // A shared page: emit unless this flavor has an override sibling.
  return files.includes(`${base}.${engine}.mdx`) ? null : relative;
}

/** Rung 4: the engines a page's frontmatter says it exists for, or null for both. */
const pageEngines = (source) =>
  source
    .match(/^engines:\s*\[([^\]]*)\]/m)?.[1]
    .split(/[\s,]+/)
    .filter(Boolean) ?? null;

/**
 * The pages a flavor's site has from one MDX mount, as `{ source, emitAs, mdx }`: rung 3 and
 * rung 4 applied, and the code swapped to the flavor's (`swapEngineImports`, `swapViewer`).
 * `skipped` collects, per directory, the keys of the pages rung 4 left out.
 */
function mountPages(mount, engine, skipped = new Map()) {
  const root = path.join(contentRoot, mount.from);
  const files = walk(root).map((file) => toPosix(path.relative(root, file)));
  const pages = [];
  for (const relative of files.filter((file) => file.endsWith('.mdx')).sort()) {
    const emitAs = resolveMdxOverride(files, relative, engine);
    if (!emitAs) continue;
    const source = fs.readFileSync(path.join(root, relative), 'utf8');
    // Rung 4 is EXISTENCE: a page declaring engines it doesn't support
    // on this site is not emitted at all — no file, no route, no nav.
    const engines = pageEngines(source);
    if (engines && !engines.includes(engine)) {
      const directory = path.dirname(relative);
      const keys = skipped.get(directory) ?? new Set();
      keys.add(path.basename(relative, '.mdx'));
      skipped.set(directory, keys);
      continue;
    }
    let mdx = source;
    if (mount.swapsEngineImports) mdx = swapEngineImports(mdx, engine);
    if (mount.swapsViewer) mdx = swapViewerCode(mdx, engine);
    mdx = swapDocumentSite(mdx, engine);
    pages.push({ source: `${mount.from}/${relative}`, emitAs, mdx });
  }
  return pages;
}

/**
 * The pages of `headless/` or `viewer/` as a flavor's site shows them, for the snippet check:
 * `{ name, source, mdx }`, named as the site routes them (`setup`, `customize/layout`), so a
 * `setup.cloud.mdx` is cloudpdf.com's `setup`.
 */
export function sitePages(section, engine) {
  const mount = MOUNTS.mdx.find((candidate) => candidate.from === section);
  if (!mount) throw new Error(`sitePages: no pages under ${section}/`);
  return mountPages(mount, engine).map(({ source, emitAs, mdx }) => ({
    name: emitAs.replace(/\.mdx$/, ''),
    source,
    mdx,
  }));
}

// ── examples on a page of their own ─────────────────────────────────────────

/** Where a site serves the examples' screenshots (`docs/content/screenshots/build.mjs`). */
export const SCREENSHOTS_DIR = 'public/screenshots';

/**
 * The examples a flavor's viewer pages show as a screenshot (`<Example name size="page">`), as
 * `{ name, slug, source }`. Such an example is an app that needs the whole window: it opens on a
 * page of its own, `/examples/<slug>`, and its docs page shows a picture of it that links there.
 * It's one of the Examples section's, `viewer/examples/<slug>`, shown by that section's page of
 * the same name.
 */
export function pageExamples(engine) {
  const examples = [];
  for (const page of sitePages('viewer', engine)) {
    for (const [tag] of page.mdx.matchAll(/<Example\b[^>]*>/g)) {
      const attributes = Object.fromEntries(
        [...tag.matchAll(/(\w+)="([^"]*)"/g)].map(([, key, value]) => [key, value]),
      );
      if (attributes.size !== 'page') continue;
      const slug = attributes.name?.match(/^viewer\/examples\/([\w-]+)$/)?.[1];
      if (!slug || page.name !== `examples/${slug}`) {
        throw new Error(
          `${page.source}: <Example name="${attributes.name}" size="page"> is an example of the ` +
            'Examples section (viewer/examples/<slug>), shown by its page there',
        );
      }
      examples.push({ name: attributes.name, slug, source: page.source });
    }
  }
  return examples;
}

// ── engine lines (headless samples, engine pages) ───────────────────────────

/**
 * The engine pages' code blocks import from the local package, as the shared
 * types and helpers are exported by both; a flavor's copy imports from its
 * own package. Only `import … from '@embedpdf/engine';` lines change, never
 * prose that names the package.
 */
function swapEngineImports(source, engine) {
  if (engine === 'local') return source;
  return source.replace(
    /^(\s*import (?:type )?\{[^}]*\} from )'@embedpdf\/engine';$/gm,
    `$1'${ENGINES[engine].package}';`,
  );
}

function transformSample(source, engine, relative) {
  const flavor = ENGINES[engine];
  let output = source;

  // Type-only imports from the local engine package swap to the flavor's
  // package — both export the same shared document types (OpenInput,
  // DocumentHandle, …). Applies to EVERY sample file, engine-provisioning
  // or not: helper components type their props against those exports too.
  if (engine !== 'local') {
    output = output.replace(
      /^(\s*import type \{[^}]*\} from )'@embedpdf\/engine';$/gm,
      `$1'${flavor.package}';`,
    );
  }

  // Samples that provision an engine carry the canonical local import plus
  // the canonical factory CALL (any binding shape around it). A sample with
  // doc-source markers but no engine lines is inconsistent — fail loudly.
  // Comments must never mention the factory call or the swap below would
  // rewrite them.
  const hasEngineLines =
    source.includes(ENGINES.local.importLine) && source.includes(ENGINES.local.factoryCall);
  const hasDocSources = source.includes('[!doc-source');
  if (!hasEngineLines) {
    if (hasDocSources) {
      throw new Error(
        `${relative}: has doc-source markers but not the canonical local engine ` +
          `import/factory lines (see engines.mjs) — mark or update the sample`,
      );
    }
    return output;
  }

  if (engine !== 'local') {
    output = output.replace(ENGINES.local.importLine, flavor.importLine);
    output = output.replaceAll(ENGINES.local.factoryCall, flavor.factoryCall);
  }

  // Swap (or, for local, unwrap) every marked document-source block.
  output = swapDocSources(output, relative, (key, body, indent) => {
    const name = body.match(/const (\w+)/)?.[1];
    if (!name) throw new Error(`${relative}: doc-source block does not declare a const`);
    return engine === 'local' ? body : `${indent}${DEMO_DOCUMENTS[key].cloudSource(name)}\n`;
  });

  // `// [!asset-engine]` … `// [!/asset-engine]`: the engine a stamp library
  // opens on. Local: the block's own body (the document engine). Cloud: a
  // local engine beside the cloud one, plus its import.
  const assetMarker =
    /^([ \t]*)\/\/ \[!asset-engine\]\n([\s\S]*?)^[ \t]*\/\/ \[!\/asset-engine\]\n/gm;
  let assetEngineUsed = false;
  output = output.replace(assetMarker, (whole, indent, body) => {
    assetEngineUsed = true;
    if (engine === 'local') return body;
    const name = body.match(/const (\w+)/)?.[1];
    if (!name) throw new Error(`${relative}: asset-engine block does not declare a const`);
    return `${indent}const ${name} = ${flavor.assetEngine.factoryCall};\n`;
  });
  if (assetEngineUsed && engine !== 'local' && flavor.assetEngine.importLine) {
    output = output.replace(
      flavor.importLine,
      `${flavor.importLine}\n${flavor.assetEngine.importLine}`,
    );
  }

  return output;
}

/**
 * Every `// [!doc-source <key>]` … `// [!/doc-source]` block, through `replace(key, body,
 * indent)`. Both marker lines are consumed WITH their leading indent — body lines carry their
 * own — so unwrapping an indented block never double-indents its first line or the line after it.
 */
function swapDocSources(source, relative, replace) {
  const marker = /^([ \t]*)\/\/ \[!doc-source (\w+)\]\n([\s\S]*?)^[ \t]*\/\/ \[!\/doc-source\]\n/gm;
  return source.replace(marker, (whole, indent, key, body) => {
    if (!DEMO_DOCUMENTS[key]) {
      throw new Error(`${relative}: unknown doc-source key '${key}' (documents.mjs)`);
    }
    return replace(key, body, indent);
  });
}

/**
 * Every `// [!doc-range <key> <name>]` … `// [!/doc-range]` block: code that names characters of
 * a demo document by index. Each site has its own copy of a document whose text differs (the
 * welcome names its own brand), so the same words can start at another index there. The block
 * names the document's local range from `documents.mjs` once, as `start: …, count: …`; a flavor's
 * copy gets that flavor's range in its place. Both marker lines are consumed, as a doc-source
 * block's are.
 */
function swapDocRanges(source, engine, relative) {
  const marker =
    /^[ \t]*\/\/ \[!doc-range (\w+) (\w+)\]\n([\s\S]*?)^[ \t]*\/\/ \[!\/doc-range\]\n/gm;
  return source.replace(marker, (whole, key, name, body) => {
    const ranges = DEMO_DOCUMENTS[key]?.ranges?.[name];
    if (!ranges) {
      throw new Error(`${relative}: unknown doc-range '${key} ${name}' (documents.mjs)`);
    }
    const local = rangeCode(ranges.local);
    if (body.split(local).length !== 2) {
      throw new Error(`${relative}: a doc-range '${key} ${name}' block names \`${local}\` once`);
    }
    return body.replace(local, rangeCode(ranges[engine]));
  });
}

/** A range as a sample writes it in an object: `start: 28, count: 9`. */
const rangeCode = ({ start, count }) => `start: ${start}, count: ${count}`;

/**
 * The demo documents on the flavor's own site. Code gives each by its full URL on embedpdf.com,
 * so it opens wherever a reader pastes it; cloudpdf.com serves the same files at its own
 * (`DOCUMENT_SITES`), its own brand's welcome among them. Runs after the viewer's swaps, which
 * find a document by its embedpdf.com URL.
 */
function swapDocumentSite(source, engine) {
  return source.replaceAll(`${DOCUMENT_SITES.local}/pdfs/`, `${DOCUMENT_SITES[engine]}/pdfs/`);
}

// ── the ready-made viewer ───────────────────────────────────────────────────

/** A viewer document's declaration, up to its value: `const welcome = `, `readonly welcome = `. */
const DECLARATION =
  /^([ \t]*(?:(?:export|public|protected|private|static|readonly|const|let|var)\s+)+[A-Za-z_$][\w$]*\s*=\s*)/;

/** How each framework binds an expression to a `src` attribute: `src={…}`, `:src="…"`, `[src]="…"`. */
const SRC_BINDINGS = {
  react: (value) => `src={${value}}`,
  svelte: (value) => `src={${value}}`,
  vue: (value) => `:src="${value}"`,
  angular: (value) => `[src]="${value}"`,
};

/**
 * The viewer's names in the flavor's words: its packages (`@embedpdf/viewer`,
 * `@embedpdf/viewer-react`, … but not a subpath such as `@embedpdf/viewer/portable`, which the
 * other door doesn't have), its CDN script, and that script's default import where the code
 * imports it from the viewer.
 */
function swapViewerNames(source, engine) {
  const from = ENGINES.local.viewer;
  const to = ENGINES[engine].viewer;
  let output = source.replaceAll(from.cdnScript, to.cdnScript);
  output = output.replace(
    new RegExp(`${escapeRegExp(from.package)}(-(?:${ALL_FRAMEWORKS.join('|')}))?(?![\\w/-])`, 'g'),
    `${to.package}$1`,
  );
  const importsDefault = new RegExp(
    `\\bimport\\s+${from.defaultImport}\\b[^;]*?\\bfrom\\s+(['"])(?:${escapeRegExp(to.cdnScript)}|${escapeRegExp(to.package)})\\1`,
  );
  if (importsDefault.test(output)) {
    output = output.replace(
      new RegExp(`\\b${from.defaultImport}\\b(?=\\s*,|\\s+from\\b|\\.[A-Za-z_$])`, 'g'),
      to.defaultImport,
    );
  }
  return output;
}

/**
 * Each demo document a file gives as `src` (one of a document's `viewerUrls`), as the flavor's
 * viewer takes it: a `src` property or assignment in code, and, in a framework's template, the
 * `src` attribute bound the framework's way. A plain HTML attribute can't hold a cloud document:
 * that page is a per-site file.
 */
function swapViewerDocuments(source, engine, integration) {
  let output = source;
  for (const document of Object.values(DEMO_DOCUMENTS)) {
    if (!document.viewerUrls) continue;
    const value = document.viewerCloud;
    for (const url of document.viewerUrls) {
      // The property's name, then the URL in either quote (group 2, closed by the same).
      const literal = `(['"])${escapeRegExp(url)}\\2`;
      output = output
        .replace(new RegExp(`(\\bsrc:\\s*)${literal}`, 'g'), (_, head) => `${head}${value}`)
        .replace(new RegExp(`(\\.src\\s*=\\s*)${literal}`, 'g'), (_, head) => `${head}${value}`);
      const bind = SRC_BINDINGS[integration];
      if (bind) {
        output = output.replace(new RegExp(`(?<![\\w:.\\[-])src="${escapeRegExp(url)}"`, 'g'), () =>
          bind(value),
        );
      }
    }
  }
  return output;
}

/**
 * A ready-made viewer sample or snippet as a flavor's site shows it. Locally its `[!doc-source]`
 * blocks unwrap; a flavor's copy keeps each block's declaration and gives it the document's form
 * (`viewerCloud`), and names its own viewer (`swapViewerNames`, `swapViewerDocuments`).
 */
export function transformViewerFile(source, engine, relative) {
  const integration = integrationOf(relative);
  const output = swapDocSources(source, relative, (key, body, indent) => {
    if (engine === 'local') return body;
    const declaration = body.match(DECLARATION)?.[1];
    if (!declaration || !/;\s*$/.test(body)) {
      throw new Error(
        `${relative}: a viewer doc-source block declares one document, untyped: ` +
          '`const welcome = …;`',
      );
    }
    const value = DEMO_DOCUMENTS[key].viewerCloud;
    if (!value) throw new Error(`${relative}: '${key}' has no viewer form (documents.mjs)`);
    return `${indent}${declaration.trimStart()}${value};\n`;
  });
  if (engine === 'local') return output;
  const swapped = swapViewerDocuments(swapViewerNames(output, engine), engine, integration);
  // A per-site file writes the demo document as its site shows it; when the grant changes in
  // documents.mjs, a copy of the old one would still open nothing.
  for (const [, grant] of swapped.matchAll(/\bgrant:\s*['"]((?:grt|shr)_[\w-]+)['"]/g)) {
    if (!DEMO_GRANTS.has(grant)) {
      throw new Error(`${relative}: ${grant} isn't a demo document's grant (documents.mjs)`);
    }
  }
  return swapped;
}

/** The grants of the demo documents, as their `viewerCloud` forms name them. */
const DEMO_GRANTS = new Set(
  Object.values(DEMO_DOCUMENTS).flatMap(
    ({ viewerCloud = '' }) => viewerCloud.match(/(?:grt|shr)_[\w-]+/g) ?? [],
  ),
);

const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** A viewer page as a flavor's site shows it: its code blocks name that flavor's viewer. */
function swapViewerCode(mdx, engine) {
  if (engine === 'local') return mdx;
  let closes = null;
  return mdx
    .split('\n')
    .map((line) => {
      if (!closes) {
        const opening = line.match(FENCE);
        if (opening) closes = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}\\s*$`);
        return line;
      }
      if (closes.test(line)) {
        closes = null;
        return line;
      }
      return swapViewerDocuments(swapViewerNames(line, engine), engine, null);
    })
    .join('\n');
}

/** A sample or snippet as a flavor's site gets it. */
export function transformFile(source, engine, relative, { viewer }) {
  if (!integrationOf(relative)) return source; // an example's stylesheet: engine-neutral
  const ranged = swapDocRanges(source, engine, relative);
  const output = viewer
    ? transformViewerFile(ranged, engine, relative)
    : transformSample(ranged, engine, relative);
  return swapDocumentSite(output, engine);
}

/** Where a site keeps its copy of the examples and snippets. */
const SAMPLES_DIR = 'src/samples';

/**
 * The examples and snippets a flavor's site has, as it shows them: each file's path under the
 * site's samples (`search/basic.react.tsx`, `snippets/start/save-button.vue`) and its code.
 */
export function siteSamples(engine, frameworks = ALL_FRAMEWORKS) {
  const samples = new Map();
  for (const mount of MOUNTS.samples) {
    const root = path.join(contentRoot, mount.from);
    const relatives = walk(root).map((file) => toPosix(path.relative(root, file)));
    for (const { source: relative, emitAs } of siteFiles(relatives, engine)) {
      const integration = integrationOf(emitAs);
      // `--frameworks` narrows the frameworks; a plain HTML page belongs to none of them.
      if (integration && integration !== 'vanilla' && !frameworks.includes(integration)) continue;
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      const emitted = transformFile(source, engine, emitAs, { viewer: mount.viewer(emitAs) });
      samples.set(toPosix(path.join(path.relative(SAMPLES_DIR, mount.to), emitAs)), emitted);
    }
  }
  return samples;
}

// ── the site's copy ─────────────────────────────────────────────────────────

function buildExpected(engine, frameworks) {
  const expected = new Map();

  for (const mount of MOUNTS.mdx) {
    // Rung-4 pages skipped for this engine, per directory — their keys must
    // also leave the directory's _meta (Nextra fails on keys with no page).
    const skippedKeysByDir = new Map();
    for (const { emitAs, mdx } of mountPages(mount, engine, skippedKeysByDir)) {
      const marked = mdx.replace(/^(---\n[\s\S]*?\n---\n)/, `$1\n${MDX_MARKER}\n`);
      expected.set(path.join(mount.to, emitAs), marked);
    }

    const root = path.join(contentRoot, mount.from);
    for (const relative of walk(root).map((file) => toPosix(path.relative(root, file)))) {
      if (relative.endsWith('.mdx')) continue;
      const source = fs.readFileSync(path.join(root, relative), 'utf8');
      if (!relative.endsWith('_meta.ts')) {
        expected.set(path.join(mount.to, relative), source);
        continue;
      }
      const skipped = skippedKeysByDir.get(path.dirname(relative)) ?? new Set();
      const filtered = [...skipped].reduce(
        (meta, key) => meta.replace(new RegExp(`^\\s*(?:'${key}'|"${key}"|${key}):.*\\n`, 'm'), ''),
        source,
      );
      expected.set(path.join(mount.to, relative), `${META_MARKER}\n${filtered}`);
    }
  }

  for (const [file, code] of siteSamples(engine, frameworks)) {
    expected.set(path.join(SAMPLES_DIR, file), code);
  }

  // The ?inline/css ambient declarations every synced samples tree needs.
  expected.set(
    'src/samples/samples-env.d.ts',
    fs.readFileSync(path.join(contentRoot, 'samples/samples-env.d.ts'), 'utf8'),
  );

  return expected;
}

function ownedRoots() {
  return [...MOUNTS.mdx, ...MOUNTS.samples].map((mount) => mount.to);
}

/** Where a site serves the demo documents (`docs/content/pdfs/build.mjs`). */
const DOCUMENTS_DIR = 'public/pdfs';

/**
 * The demo documents the site's copy opens, as a reader copies the code: by full URL, since
 * `/pdfs/…` opens nothing on the reader's page, and each one a file the site serves.
 */
export function documentProblems(expected, engine, target) {
  const site = `${DOCUMENT_SITES[engine]}/pdfs/`;
  const problems = [];
  for (const [relative, contents] of expected) {
    if (/['"`]\/pdfs\//.test(contents)) {
      problems.push(`${relative}: opens a demo document at /pdfs/…; give its full URL, ${site}…`);
    }
    for (const [url, file] of contents.matchAll(
      new RegExp(`${escapeRegExp(site)}([\\w.-]+)`, 'g'),
    )) {
      if (!fs.existsSync(path.join(target, DOCUMENTS_DIR, file))) {
        problems.push(`${relative}: ${url} isn't a file the site serves (${DOCUMENTS_DIR})`);
      }
    }
  }
  return problems;
}

async function main() {
  const args = parseArgs(process.argv);
  const expected = buildExpected(args.engine, args.frameworks);

  const problems = documentProblems(expected, args.engine, args.target);
  if (problems.length) {
    console.error("Docs code opens a demo document that won't open where a reader pastes it:");
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
  }

  const stale = [];
  const onDisk = new Set(
    ownedRoots().flatMap((root) =>
      walk(path.join(args.target, root)).map((file) => path.relative(args.target, file)),
    ),
  );

  for (const [relative, contents] of expected) {
    const absolute = path.join(args.target, relative);
    let current = null;
    try {
      current = fs.readFileSync(absolute, 'utf8');
    } catch {
      /* missing */
    }
    if (current !== contents) stale.push(relative);
    onDisk.delete(relative);
  }
  const orphans = [...onDisk].filter((relative) =>
    ownedRoots().some((root) => relative.startsWith(root)),
  );

  if (args.check) {
    if (stale.length || orphans.length) {
      console.error('Synced docs content is stale:');
      for (const file of [...stale, ...orphans.map((o) => `${o} (orphan)`)]) {
        console.error(`- ${file}`);
      }
      console.error('Run: pnpm docs:sync');
      process.exit(1);
    }
    const unpictured = pageExamples(args.engine).filter(
      ({ name }) => !fs.existsSync(path.join(args.target, SCREENSHOTS_DIR, `${name}.webp`)),
    );
    if (unpictured.length) {
      console.error('Examples on a page of their own with no screenshot:');
      for (const { name } of unpictured) console.error(`- ${SCREENSHOTS_DIR}/${name}.webp`);
      console.error('Run: pnpm --filter @embedpdf/docs-content screenshots');
      process.exit(1);
    }
    console.log(`Docs content is current (${expected.size} files, engine=${args.engine}).`);
    await checkReference();
    await writePublishStatus();
    return;
  }

  for (const orphan of orphans) fs.unlinkSync(path.join(args.target, orphan));
  for (const [relative, contents] of expected) {
    const absolute = path.join(args.target, relative);
    fs.mkdirSync(path.dirname(absolute), { recursive: true });
    fs.writeFileSync(absolute, contents);
  }
  console.log(
    `Synced ${expected.size} files into ${path.relative(process.cwd(), args.target) || '.'} (engine=${args.engine}${
      args.frameworks.length < ALL_FRAMEWORKS.length
        ? `, frameworks=${args.frameworks.join(',')}`
        : ''
    }).`,
  );
}

// The snippet check and the package READMEs read the pages and files a site gets from here
// (`sitePages`, `siteFiles`, `siteSamples`, `transformViewerFile`); only `node scripts/sync.mjs`
// syncs.
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await main();
