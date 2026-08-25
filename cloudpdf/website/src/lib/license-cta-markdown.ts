import { mdast, type AstNode } from '@embedpdf/docs-kit';

import { LICENSE_CTA_COPY } from './license-cta-copy';

const { link, paragraph, strong, text } = mdast;

/**
 * Markdown projection for <LicenseCta>: the dialog button becomes a
 * plain link to the contact page; title/body honor the MDX attributes
 * and children the page authored, falling back to the shared copy.
 */
export function projectLicenseCta(
  node: AstNode,
  helpers: {
    resolveNodes: (nodes: AstNode[]) => AstNode[];
    absoluteContentUrl: (url: string) => string;
    stringAttribute: (node: AstNode, name: string) => string;
  },
): AstNode[] {
  const hasTitle = node.attributes?.some((a) => a.name === 'title') ?? false;
  const title = hasTitle ? helpers.stringAttribute(node, 'title') : LICENSE_CTA_COPY.title;
  const body = helpers.resolveNodes(node.children ?? []);
  return [
    paragraph([strong(title)]),
    ...(body.length > 0 ? body : [paragraph([text(LICENSE_CTA_COPY.body)])]),
    paragraph([
      link(helpers.absoluteContentUrl(LICENSE_CTA_COPY.contactPath), LICENSE_CTA_COPY.action),
    ]),
  ];
}
