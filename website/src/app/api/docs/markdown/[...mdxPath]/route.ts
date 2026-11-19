import {
  docsMarkdownParams,
  docsMarkdownResponse,
  type DocsMarkdownRouteProps,
} from '@/lib/docs-markdown-route';

// Every page's Markdown is built with the site; any other path is a 404.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return docsMarkdownParams();
}

export async function GET(_request: Request, props: DocsMarkdownRouteProps) {
  const { mdxPath } = await props.params;
  return docsMarkdownResponse(mdxPath, 'text/markdown; charset=utf-8');
}
