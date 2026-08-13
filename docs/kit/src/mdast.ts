import type { AstNode } from './docs-markdown';

/**
 * mdast node builders for site Markdown projections.
 *
 * Projection files compose these over their site's DATA modules — the same
 * modules the page components render — and contain no reader-facing string
 * literals of their own (DOCS-PLATFORM-ARCHITECTURE.md: a page and its .md
 * are two renderings of one content source).
 */

export const text = (value: string): AstNode => ({ type: 'text', value });

export const inlineCode = (value: string): AstNode => ({ type: 'inlineCode', value });

export const strong = (value: string): AstNode => ({
  type: 'strong',
  children: [text(value)],
});

export const paragraph = (children: AstNode[]): AstNode => ({ type: 'paragraph', children });

export const heading = (depth: number, value: string): AstNode => ({
  type: 'heading',
  depth,
  children: [text(value)],
});

export const code = (lang: string, value: string): AstNode => ({ type: 'code', lang, value });

export const link = (url: string, label: string): AstNode => ({
  type: 'link',
  url,
  children: [text(label)],
});

export const listItem = (children: AstNode[]): AstNode => ({
  type: 'listItem',
  spread: false,
  children,
});

export const list = (items: AstNode[]): AstNode => ({
  type: 'list',
  ordered: false,
  spread: false,
  children: items,
});

export const blockquote = (value: string): AstNode => ({
  type: 'blockquote',
  children: [paragraph([text(value)])],
});
