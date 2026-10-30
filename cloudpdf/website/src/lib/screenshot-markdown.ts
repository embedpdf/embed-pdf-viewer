import { mdast, type AstNode } from '@embedpdf/docs-kit';

import { screenshotOf } from './screenshots';

const { image, paragraph, text } = mdast;

/** Markdown projection for <Screenshot>: the image, and its caption under it. */
export function projectScreenshot(
  node: AstNode,
  helpers: {
    absoluteContentUrl: (url: string) => string;
    stringAttribute: (node: AstNode, name: string) => string;
  },
): AstNode[] {
  const shot = screenshotOf(helpers.stringAttribute(node, 'name'));
  const caption = node.attributes?.some((a) => a.name === 'caption')
    ? helpers.stringAttribute(node, 'caption')
    : null;
  return [
    paragraph([image(helpers.absoluteContentUrl(shot.src), helpers.stringAttribute(node, 'alt'))]),
    ...(caption ? [paragraph([text(caption)])] : []),
  ];
}
