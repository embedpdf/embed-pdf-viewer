import {
  docsMarkdownParams,
  docsMarkdownResponse,
  type DocsMarkdownRouteProps,
} from '@/lib/docs-markdown-route';

// The `markdown` route's body as `text/plain`, which a browser shows as text.
// The middleware sends a browser that opens a `.md` link here.
export const dynamic = 'force-static';
export const dynamicParams = false;

export function generateStaticParams() {
  return docsMarkdownParams();
}

export async function GET(_request: Request, props: DocsMarkdownRouteProps) {
  const { mdxPath } = await props.params;
  return docsMarkdownResponse(mdxPath, 'text/plain; charset=utf-8');
}
