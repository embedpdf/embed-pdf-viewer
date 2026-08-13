import type { AstNode } from '@embedpdf/docs-kit';

import { projectApiReferenceComponent } from './api-reference-markdown';
import { projectDocsLanding } from './docs-landing-markdown';

/**
 * This site's `projectComponent` hook: a thin dispatcher over the domain
 * projection modules. Each domain file owns its own components and reads
 * its own data modules; anything unknown falls through to the kit's fatal
 * unknown-component rule.
 */
export function projectCloudPdfComponent(
  node: AstNode,
  helpers: {
    resolveNodes: (nodes: AstNode[]) => AstNode[];
    absoluteContentUrl: (url: string) => string;
    stringAttribute: (node: AstNode, name: string) => string;
  },
): AstNode[] | null | undefined {
  if (node.name === 'DocsLanding') return projectDocsLanding(helpers.absoluteContentUrl);
  return projectApiReferenceComponent(node, helpers);
}
