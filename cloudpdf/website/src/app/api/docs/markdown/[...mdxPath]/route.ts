import { generateStaticParamsFor, importPage } from 'nextra/pages';

import { renderDocsMarkdown } from '@/lib/docs-markdown';
import { expandDocsStaticParams, resolveDocsPath } from '@/lib/docs-route';

const nextraParams = generateStaticParamsFor('mdxPath');

export const dynamic = 'force-static';
export const dynamicParams = false;

export async function generateStaticParams() {
  return expandDocsStaticParams(await nextraParams());
}

type RouteProps = {
  params: Promise<{ mdxPath: string[] }>;
};

export async function GET(_request: Request, props: RouteProps) {
  const { mdxPath } = await props.params;
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
  });
  const filename = `${mdxPath.at(-1) ?? 'documentation'}.md`;

  return new Response(markdown, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
