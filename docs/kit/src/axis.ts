import type { FeedbackSite } from './feedback';

/**
 * The two content axes (DOCS-PLATFORM-ARCHITECTURE.md):
 *
 * - framework — chosen by the reader, resolved at runtime from the URL
 * - engine    — chosen by the product, resolved at build time per site
 *
 * A site's binding fixes the engine axis; the `remarkEngineAxis` plugin
 * (exported from `@embedpdf/docs-kit/mdx`) applies it to `<Engine>` blocks
 * at MDX compile time.
 */
export type DocsEngine = 'local' | 'cloud';

export interface DocsSiteBinding {
  site: FeedbackSite;
  engine: DocsEngine;
}

/**
 * Rung 4 of the fork ladder: a page's frontmatter may declare which engines
 * it exists for (`engines: [cloud]`). No declaration means both. Sidebars
 * filter their trees with this; the support matrix derives from it.
 */
export function pageSupportsEngine(
  frontMatter: { engines?: unknown } | undefined,
  engine: DocsEngine,
): boolean {
  const engines = frontMatter?.engines;
  if (!Array.isArray(engines) || engines.length === 0) return true;
  return engines.includes(engine);
}
