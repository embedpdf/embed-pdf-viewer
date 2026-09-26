import { mdast, type AstNode } from '@embedpdf/docs-kit';

import { projectDocsOverview } from './docs-overview-markdown';

/**
 * This site's `projectComponent` hook: a thin dispatcher over the domain
 * projection modules. Anything unknown falls through to the kit's fatal
 * unknown-component rule.
 */
export function projectEmbedPdfComponent(
  node: AstNode,
  helpers: {
    absoluteContentUrl: (url: string) => string;
    resolveNodes: (nodes: AstNode[]) => AstNode[];
    stringAttribute: (node: AstNode, name: string) => string;
  },
): AstNode[] | null {
  if (node.name === 'DocsOverview') return projectDocsOverview(helpers.absoluteContentUrl);
  if (node.name === 'CloudPdfCallout') {
    // A blockquote, like any callout: the author's title, body and link.
    const { link, paragraph, strong } = mdast;
    return [
      {
        type: 'blockquote',
        children: [
          paragraph([strong(helpers.stringAttribute(node, 'title'))]),
          ...helpers.resolveNodes(node.children ?? []),
          paragraph([
            link(
              helpers.absoluteContentUrl(helpers.stringAttribute(node, 'href')),
              helpers.stringAttribute(node, 'cta'),
            ),
          ]),
        ],
      },
    ];
  }
  return null;
}
