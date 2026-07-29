import type { DocsIntegration } from '../docs-integrations';
import type { DocsProduct } from '../docs-products';

/**
 * Excerpt highlight markers, shared by the query layer and the client.
 *
 * Deliberately not `<mark>`: `ts_headline` does not escape the text it wraps,
 * so HTML tags would force the client into `dangerouslySetInnerHTML` over
 * strings containing arbitrary doc prose. These are invisible Unicode isolates
 * that never occur in documentation, so the client can split them into real
 * React nodes and the worst possible failure is a missed highlight.
 */
export const HIGHLIGHT_OPEN = '⁨';
export const HIGHLIGHT_CLOSE = '⁩';

/**
 * One indexed unit: a heading-scoped slice of a single *content source* page.
 *
 * Deliberately not a slice of a public URL. `docs/headless/stage.mdx` fans out
 * to four integration routes; indexing those separately would return the same
 * passage four times for every query. The index stores the source once and the
 * reader's integration resolves to a URL at query time.
 */
export type DocsSection = {
  /** Content source, no integration segment: `docs/headless/plugins/stage`. */
  contentPath: string;
  /** Heading slug, or null for the lede above the first heading. */
  anchor: string | null;
  pageTitle: string;
  pageDescription: string | null;
  sectionTitle: string | null;
  /** Human trail for result display: `['Headless', 'Plugins', 'Stage']`. */
  breadcrumb: string[];
  product: DocsProduct | null;
  /** Heading depth (2 for `##`, 3 for `###`); 0 for the lede. */
  depth: number;
  /** Position on the page, so equal-scoring sections keep reading order. */
  ordinal: number;
  /** Prose as the default integration renders it. */
  prose: string;
  /**
   * Prose that only exists behind an `<Fw only=…>` branch, keyed by
   * integration. Searchable, but weighted below shared prose.
   */
  variantProse: Partial<Record<DocsIntegration, string>>;
  /** Identifiers worth exact-matching, keyed by integration ('*' = shared). */
  symbols: Record<string, string[]>;
};

export type DocsSearchHit = {
  contentPath: string;
  anchor: string | null;
  /** Resolved for the requesting reader's integration. */
  url: string;
  pageTitle: string;
  sectionTitle: string | null;
  breadcrumb: string[];
  product: DocsProduct | null;
  /** Prose window around the match, for the result row. */
  excerpt: string;
  /** Which retrievers found this, for debugging and telemetry. */
  matchedBy: ('lexical' | 'semantic')[];
  score: number;
};

export type DocsSearchResponse = {
  query: string;
  /** True when the dense half was skipped (no key, timeout, provider error). */
  degraded: boolean;
  integration: DocsIntegration | null;
  hits: DocsSearchHit[];
};
