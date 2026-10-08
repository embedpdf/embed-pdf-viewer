import fs from 'node:fs';

/**
 * The publish gate: a headless page is live for a framework once its snippets compile for it and
 * it names nothing pending in `docs/content/reference.mjs`; a viewer page once its snippets and
 * the code it shows compile, for each framework and for plain HTML (`vanilla`). `docs:check`
 * works that out on every build (`docs/content/scripts/publish-gate.mjs`) and writes
 * `docs/content/generated/live-pages.json`; this module reads it for a site.
 *
 * A page that isn't live shows its title and why (`UnreleasedNotice` in `./release.tsx`), and
 * stays out of search, `llms.txt` and search engines. The preview site shows every page; one that
 * production holds back carries a banner under its title.
 */

export type LivePages = {
  /**
   * Per page (`text/search`, `annotations/index`, and the viewer's `viewer/setup`): what holds it
   * back, and where it's live.
   */
  pages: Record<string, { pending: string[]; live: Record<string, boolean> }>;
};

/** What a docs route shows. */
export type DocsRelease = {
  /** The page shows in full: it's live for this framework, or this is the preview site. */
  live: boolean;
  /** The preview site shows a page production holds back: it carries the preview banner. */
  preview: boolean;
  /** The page is live for React, so a version that isn't can point there. */
  reactLive: boolean;
};

/**
 * The preview site (`DOCS_PREVIEW=1`) shows every page, as 3.0 is planned. So does `next dev`,
 * where authors write pages ahead of the code, unless `DOCS_PREVIEW=0`.
 */
export function isDocsPreview(env: Record<string, string | undefined> = process.env): boolean {
  if (env.DOCS_PREVIEW) return env.DOCS_PREVIEW === '1';
  return env.NODE_ENV === 'development';
}

const loaded = new Map<string, { modified: number; livePages: LivePages }>();

/** A site's `live-pages.json`, read again only when `docs:check` rewrites it. */
export function loadLivePages(file: string): LivePages {
  let modified: number;
  try {
    modified = fs.statSync(file).mtimeMs;
  } catch {
    throw new Error(
      `${file} is missing: run \`pnpm docs:check\`, which writes the pages that are live.`,
    );
  }
  const cached = loaded.get(file);
  if (cached?.modified === modified) return cached.livePages;
  const livePages = JSON.parse(fs.readFileSync(file, 'utf8')) as LivePages;
  loaded.set(file, { modified, livePages });
  return livePages;
}

/** The docs the gate decides for: the headless pages, and the viewer's. */
const GATED = /^\/?docs\/(headless|viewer)(\/|$)/;

/**
 * `docs/headless/text/search` → `text/search`, `docs/viewer/customize/layout` →
 * `viewer/customize/layout`; an index page is `annotations/index`, `viewer/index`.
 */
function pageName(contentPath: string, pages: LivePages['pages']): string {
  const [, product, rest] = contentPath.match(/^\/?docs\/(headless|viewer)\/?(.*)$/) ?? [];
  const prefix = product === 'viewer' ? 'viewer/' : '';
  if (!rest) return `${prefix}index`;
  const name = `${prefix}${rest}`;
  return name in pages ? name : `${name}/index`;
}

/**
 * What a docs route shows: its page, or the notice that it isn't released for this framework.
 * Headless and viewer pages are gated. `livePages` is read only when the gate decides, so the
 * preview site never needs `docs:check` to have run.
 */
export function docsRelease({
  contentPath,
  framework,
  preview,
  livePages,
}: {
  /** The route's content source: `docs/headless/text/search`, `docs/viewer/setup`. */
  contentPath: string;
  framework: string | undefined;
  preview: boolean;
  livePages: () => LivePages;
}): DocsRelease {
  if (!GATED.test(contentPath) || !framework) {
    return { live: true, preview: false, reactLive: true };
  }
  if (preview) {
    // Every page shows; the banner marks the ones production holds back. Without the gate's
    // file (`docs:check` hasn't run), there's nothing to mark.
    let released = true;
    try {
      const { pages } = livePages();
      released = pages[pageName(contentPath, pages)]?.live[framework] === true;
    } catch {
      released = true;
    }
    return { live: true, preview: !released, reactLive: true };
  }
  const { pages } = livePages();
  // A page added since `docs:check` last ran waits for the next check.
  const page = pages[pageName(contentPath, pages)];
  return {
    live: page?.live[framework] === true,
    preview: false,
    reactLive: page?.live.react === true,
  };
}
