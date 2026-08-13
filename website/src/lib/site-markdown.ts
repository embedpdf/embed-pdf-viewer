import type { AstNode } from '@embedpdf/docs-kit';

import { projectDocsOverview } from './docs-overview-markdown';

/**
 * This site's `projectComponent` hook: a thin dispatcher over the domain
 * projection modules. Anything unknown falls through to the kit's fatal
 * unknown-component rule.
 */
export function projectEmbedPdfComponent(
  node: AstNode,
  helpers: { absoluteContentUrl: (url: string) => string },
): AstNode[] | null {
  if (node.name === 'DocsOverview') return projectDocsOverview(helpers.absoluteContentUrl);
  return null;
}
