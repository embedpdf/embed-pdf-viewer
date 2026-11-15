/**
 * Whether a request asks for a docs page as Markdown.
 *
 * A page's Markdown has its own address (`<page>.md`), and the page's URL serves it too to a
 * request that asks for it in its `Accept` header (docs/conventions/docs-architecture.md). AI
 * coding agents ask this way; a browser never names Markdown, so a person always gets the page.
 *
 * Free of Node and React, so a site's middleware can import it.
 */

const MARKDOWN = 'text/markdown';
const HTML = 'text/html';

type AcceptEntry = { range: string; quality: number };

/** An `Accept` header's entries: each media range with its quality, 1 where it gives none. */
function acceptEntries(accept: string): AcceptEntry[] {
  return accept.split(',').map((entry) => {
    const [range, ...parameters] = entry.split(';').map((part) => part.trim().toLowerCase());
    const q = parameters.find((parameter) => parameter.startsWith('q='));
    const quality = q === undefined ? 1 : Number(q.slice(2));
    return { range, quality: Number.isFinite(quality) ? Math.min(Math.max(quality, 0), 1) : 1 };
  });
}

/** The quality a header gives a media type: its own entry's, else its family's, else the wildcard's. */
function qualityOf(entries: AcceptEntry[], type: string): number {
  const family = `${type.slice(0, type.indexOf('/'))}/*`;
  for (const range of [type, family, '*/*']) {
    const entry = entries.find((candidate) => candidate.range === range);
    if (entry) return entry.quality;
  }
  return 0;
}

/**
 * True for an `Accept` header that names `text/markdown` and ranks it no lower than `text/html`
 * (`text/markdown, text/html`). A wildcard alone doesn't count: every client sends one.
 */
export function prefersMarkdown(accept: string | null | undefined): boolean {
  if (!accept) return false;
  const entries = acceptEntries(accept);
  const markdown = entries.find((entry) => entry.range === MARKDOWN)?.quality ?? 0;
  return markdown > 0 && markdown >= qualityOf(entries, HTML);
}
