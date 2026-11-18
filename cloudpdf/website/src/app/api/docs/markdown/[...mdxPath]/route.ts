import { generateStaticParamsFor, importPage } from 'nextra/pages';

import { renderDocsMarkdown } from '@/lib/docs-markdown';
import { docsRelease, liveSiblings } from '@/lib/docs-release';
import { expandDocsStaticParams, resolveDocsPath } from '@/lib/docs-route';

const nextraParams = generateStaticParamsFor('mdxPath');

export const dynamic = 'force-static';

export async function generateStaticParams() {
  return expandDocsStaticParams(await nextraParams());
}

let documentedPaths: Promise<Set<string>> | undefined;

type RouteProps = {
  params: Promise<{ mdxPath: string[] }>;
};

export async function GET(_request: Request, props: RouteProps) {
  const { mdxPath: requestedPath } = await props.params;
  // The inline representation is cached on demand against the same known pages.
  const inline = requestedPath[0] === 'inline' && requestedPath[1] === 'docs';
  const mdxPath = inline ? requestedPath.slice(1) : requestedPath;
  const canonicalPath = `/${mdxPath.join('/')}`;
  const knownPaths = await (documentedPaths ??= generateStaticParams().then(
    (entries) => new Set(entries.map((entry) => `/${entry.mdxPath.join('/')}`)),
  ));
  const resolved = resolveDocsPath(mdxPath);
  if (!resolved || !knownPaths.has(canonicalPath)) {
    return new Response('Documentation page not found.', { status: 404 });
  }

  // Projection errors deliberately escape: an unsupported MDX component must
  // fail the build rather than publish an incomplete Markdown representation.
  const { sourceCode, metadata } = await importPage(resolved.contentPath);
  const markdown = renderDocsMarkdown({
    sourceCode,
    metadata,
    integration: resolved.integration,
    canonicalPath,
    // Says what the page says: in full, or why the publish gate holds it back.
    release: docsRelease(resolved.contentPath, resolved.integration),
    siblings: liveSiblings(resolved.contentPath, resolved.integration),
  });
  const filename = `${mdxPath.at(-1) ?? 'documentation'}.md`;

  return new Response(markdown, {
    headers: {
      'Content-Type': inline ? 'text/plain; charset=utf-8' : 'text/markdown; charset=utf-8',
      'Content-Disposition': `inline; filename="${filename}"`,
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Accept, Sec-Fetch-Mode',
    },
  });
}
