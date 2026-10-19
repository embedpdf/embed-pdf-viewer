import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/**
 * Where the code of every `<Example>` and `<Snippet>` waits between the MDX compile and the page
 * render (docs/conventions/docs-architecture.md: code display is kit machinery, shared by both
 * docs sites).
 *
 * Every example has a version per framework, each a few highlighted files. When the compiled
 * pages carried all of them, a page module was 1–3 MB, the docs route compiled every page, and the
 * dev server ran out of memory on its first request. So the compile writes each framework's files
 * to a JSON file of its own, and the page only says where they are: the example's key and the
 * frameworks that have a version. The page render reads the one framework its route shows.
 *
 *   compile (rehype)   writeCodePanels(dir, 'search/basic', highlighted)
 *                        → .next/cache/docs-code/search/basic.<hash>.vue.json, one per framework
 *                        → <Example codeKey="search/basic.<hash>" codeFrameworks="react,vue,…">
 *   render (server)    routeCodePanels({ dir, codeKey, codeFrameworks, framework: 'vue' })
 *                        → the Vue files only, and which frameworks have a version
 *
 * The key ends in a hash of the files, so a page can never be served another version's code: a
 * changed sample is a new key, and a key's files never change.
 *
 * The files live in `.next/cache/` because they belong with the compiled pages: webpack's
 * persistent cache keeps compiled pages across restarts (and Vercel restores `.next/cache` across
 * deploys), so a cached page must find the files it was compiled with. Deleting `.next` deletes
 * both. `openCodePanels` (next.config) keeps them in step otherwise: it hashes the inputs the
 * files come from, and when they changed it starts the store over with a new generation, which is
 * folded into webpack's cache version, so every cached page compiles again and writes its files
 * again. A cached page therefore only ever runs with the store generation it was compiled in.
 *
 * Plain ESM (like the other `mdx/` modules) so `next.config.ts` can load it without a transpile
 * step.
 */

/** The store, relative to a site's root. Not under `public/`: the files are read on the server. */
export const CODE_PANELS_DIR = '.next/cache/docs-code';

/** Which inputs and generation the store holds (see `openCodePanels`). */
const STORE_FILE = 'store.json';

/** A key is a sample name (`annotations/tools`, `snippets/search/box`) and a hash. */
const KEY_PATTERN = /^[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_-]+)*\.[0-9a-f]{16}$/;
const FRAMEWORK_PATTERN = /^[a-z]+$/;

/** A site's store. The page render passes nothing: the site's root is the working directory. */
export function codePanelsDir(siteRoot = process.cwd()) {
  return path.join(siteRoot, CODE_PANELS_DIR);
}

/**
 * Opens the store for this dev session or build (next.config, once per process): hashes the
 * inputs the code panels are made from (files or directories, relative to the site; a missing
 * one counts as empty), and starts the store over when they changed since it was made.
 *
 * Returns the store's directory, for the rehype pass, and `cacheVersion`, which next.config folds
 * into webpack's persistent cache version (`withCodePanelsCache`): a changed sample then
 * recompiles every page, so it shows up, and a store that was started over, or deleted, can't
 * meet a cached page that points into the old one.
 */
export function openCodePanels({ siteRoot, inputs }) {
  const dir = codePanelsDir(siteRoot);
  const inputsHash = hashInputs(siteRoot, inputs);
  const store = readStore(dir);
  let generation = store?.inputs === inputsHash ? store.generation : null;
  if (!generation) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    generation = crypto.randomBytes(8).toString('hex');
    fs.writeFileSync(
      path.join(dir, STORE_FILE),
      JSON.stringify({ inputs: inputsHash, generation }),
    );
  }
  return { dir, cacheVersion: `docs-code:${inputsHash}:${generation}` };
}

/** Folds the store's version into a webpack config's persistent cache (next.config `webpack`). */
export function withCodePanelsCache(webpackConfig, panels) {
  const cache = webpackConfig.cache;
  if (cache && typeof cache === 'object' && cache.type === 'filesystem') {
    cache.version = `${cache.version ?? ''}|${panels.cacheVersion}`;
  }
  return webpackConfig;
}

/**
 * Stores one example's highlighted files (compile time): one JSON file per framework that has
 * any. Returns the reference the compiled page keeps instead of the files.
 *
 * @param {string} dir the store (`codePanelsDir`)
 * @param {string} name the sample name, `snippets/…` for a `<Snippet>`
 * @param {Record<string, unknown[]>} byFramework each framework's highlighted files
 */
export function writeCodePanels(dir, name, byFramework) {
  const frameworks = Object.keys(byFramework).filter((fw) => byFramework[fw]?.length);
  const hash = crypto
    .createHash('sha256')
    .update(JSON.stringify(frameworks.map((fw) => [fw, byFramework[fw]])))
    .digest('hex')
    .slice(0, 16);
  const key = `${name}.${hash}`;
  for (const framework of frameworks) {
    const file = panelFile(dir, key, framework);
    // Same key, same files: another page (or an earlier compile) already wrote it.
    if (fs.existsSync(file)) continue;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    // Written whole, then renamed, so a render never reads half a file.
    const temporary = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(byFramework[framework]));
    fs.renameSync(temporary, file);
  }
  return { key, frameworks };
}

/** The MDX attributes that point a compiled `<Example>` or `<Snippet>` at its stored files. */
export function codePanelAttributes({ key, frameworks }) {
  return [
    { type: 'mdxJsxAttribute', name: 'codeKey', value: key },
    { type: 'mdxJsxAttribute', name: 'codeFrameworks', value: frameworks.join(',') },
  ];
}

/**
 * One framework's stored files for an example (render time). A missing file means the compiled
 * page and the store disagree, which `openCodePanels` exists to prevent, so it throws rather than
 * show the page without its code.
 */
export function readCodePanel(dir, key, framework) {
  const file = panelFile(dir, key, framework);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') {
      throw new Error(
        `[docs-kit code panels] No ${framework} code for "${key}" in ${dir}. The compiled page ` +
          'points at a file the store does not have; delete .next and start again.',
      );
    }
    throw error;
  }
}

/**
 * What one route shows of an `<Example>` or `<Snippet>`, from the props its compiled page gives
 * it: the route's framework's files and demo, and every framework that has a version (for the
 * "not available yet" note). A route without a framework (a page that isn't fanned out) gets
 * every framework's, and the browser picks.
 */
export function routeCodePanels({ dir, codeKey, codeFrameworks, demosByFramework, framework }) {
  const available = codeFrameworks ? codeFrameworks.split(',').filter(Boolean) : [];
  const shown = framework ? available.filter((fw) => fw === framework) : available;
  const filesByFramework = {};
  for (const fw of shown) filesByFramework[fw] = readCodePanel(dir, codeKey, fw);

  const demos = demosByFramework ? JSON.parse(demosByFramework) : {};
  const routeDemos = framework
    ? demos[framework]
      ? { [framework]: demos[framework] }
      : {}
    : demos;
  return { filesByFramework, demosByFramework: routeDemos, available };
}

function panelFile(dir, key, framework) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new Error(`[docs-kit code panels] Not a code panel key: ${JSON.stringify(key)}`);
  }
  if (!FRAMEWORK_PATTERN.test(framework)) {
    throw new Error(`[docs-kit code panels] Not a framework: ${JSON.stringify(framework)}`);
  }
  return path.join(dir, `${key}.${framework}.json`);
}

function readStore(dir) {
  try {
    return JSON.parse(fs.readFileSync(path.join(dir, STORE_FILE), 'utf8'));
  } catch {
    return null;
  }
}

/** A hash of every file under the inputs: their paths (relative to the site) and contents. */
function hashInputs(siteRoot, inputs) {
  const hash = crypto.createHash('sha256');
  const visit = (absolute) => {
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch {
      return; // A missing input (no demos built yet) counts as empty.
    }
    if (stat.isDirectory()) {
      const entries = fs.readdirSync(absolute).sort((a, b) => a.localeCompare(b));
      for (const entry of entries) visit(path.join(absolute, entry));
    } else if (stat.isFile()) {
      hash.update(path.relative(siteRoot, absolute).split(path.sep).join('/'));
      hash.update(fs.readFileSync(absolute));
    }
  };
  for (const input of inputs) visit(path.resolve(siteRoot, input));
  return hash.digest('hex').slice(0, 16);
}
