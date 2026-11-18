import { generateStaticParamsFor, importPage } from 'nextra/pages';

import { renderDocsMarkdown } from './docs-markdown';
import { docsRelease, liveSiblings } from './docs-release';
import { expandDocsStaticParams, resolveDocsPath } from './docs-route';

const nextraParams = generateStaticParamsFor('mdxPath');

export type DocsMarkdownRouteProps = {
  params: Promise<{ mdxPath: string[] }>;
};

/** Every public docs route: the pages each Markdown route builds. */
export async function docsMarkdownParams() {
  return expandDocsStaticParams(await nextraParams());
}

/** A docs route's Markdown, answered as `contentType`. */
export async function docsMarkdownResponse(mdxPath: string[], contentType: string) {
  const resolved = resolveDocsPath(mdxPath);
  if (!resolved) return new Response('Documentation page not found.', { status: 404 });

  // Projection errors deliberately escape: an unsupported MDX component must
  // fail the build rather than publish an incomplete Markdown representation.
  const { sourceCode, metadata } = await importPage(resolved.contentPath);
  const markdown = renderDocsMarkdown({
    sourceCode,
    metadata,
    integration: resolved.integration,
    canonicalPath: `/${mdxPath.join('/')}`,
    // Says what the page says: in full, or why the publish gate holds it back.
    release: docsRelease(resolved.contentPath, resolved.integration),
    siblings: liveSiblings(resolved.contentPath, resolved.integration),
  });
  const filename = `${mdxPath.at(-1) ?? 'documentation'}.md`;

  return new Response(markdown, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
