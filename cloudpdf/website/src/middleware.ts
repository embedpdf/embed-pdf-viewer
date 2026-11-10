import { prefersMarkdown } from '@embedpdf/docs-kit/accept';
import { NextResponse, type NextRequest } from 'next/server';

import {
  DOCS_ENTRY_TOPIC,
  docsIntegrationFromPath,
  INTEGRATION_COOKIE,
  integrationForProduct,
  isDocsIntegration,
  isHeadlessIntegration,
} from '@/lib/docs-integrations';

/**
 * Variant-less Viewer and Headless URLs are courtesy doors: redirect to the
 * shared persisted integration when supported, otherwise the product default.
 * Concrete URLs always win and update the preference for the next product.
 * Framework-less docs products (engine, server, api-reference) fall through.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isMarkdown = pathname.endsWith('.md');
  const docsPath = isMarkdown ? pathname.slice(0, -3) : pathname;
  const segments = docsPath.split('/');

  const redirectToVariant = (product: 'headless' | 'viewer', variant: string) => {
    const rest = segments.slice(3).join('/');
    const topic = rest || DOCS_ENTRY_TOPIC[product];
    const url = request.nextUrl.clone();
    url.pathname = `/docs/${product}/${variant}${topic ? `/${topic}` : ''}${isMarkdown ? '.md' : ''}`;
    return NextResponse.redirect(url, 307);
  };

  const persistedIntegration = () => {
    const value = request.cookies.get(INTEGRATION_COOKIE)?.value;
    return isDocsIntegration(value) ? value : null;
  };

  // /docs/headless or /docs/headless/<not-an-integration>/…
  if (segments[2] === 'headless' && !isHeadlessIntegration(segments[3])) {
    return redirectToVariant('headless', integrationForProduct('headless', persistedIntegration()));
  }

  // /docs/viewer or /docs/viewer/<not-an-integration>/…
  if (segments[2] === 'viewer' && !isDocsIntegration(segments[3])) {
    return redirectToVariant('viewer', integrationForProduct('viewer', persistedIntegration()));
  }

  // Public Markdown representations are served by a statically generated
  // Route Handler.
  const markdownOf = (page: string) => {
    const url = request.nextUrl.clone();
    url.pathname = `/api/docs/markdown${page}`;
    return NextResponse.rewrite(url);
  };

  // The discoverable `<page>.md` URL. `/docs.md` (the landing) is its own
  // top-level path, hence the matcher's second entry and the explicit
  // equality check here.
  if (pathname === '/docs.md' || (pathname.startsWith('/docs/') && isMarkdown)) {
    return markdownOf(docsPath);
  }

  // A file under `/docs` (a screenshot) has a dot in its name, and one answer.
  if (segments.at(-1)?.includes('.')) return NextResponse.next();

  // A page's own URL serves its Markdown too, to a request that asks for it
  // (`Accept: text/markdown`), as AI coding agents do. Either answer says it
  // depends on that header, so a cache keeps the two apart.
  const asksForMarkdown = prefersMarkdown(request.headers.get('accept'));
  const response = asksForMarkdown ? markdownOf(pathname) : NextResponse.next();
  response.headers.append('Vary', 'Accept');

  // The page a person opens is the integration the next product opens in.
  const activeIntegration = asksForMarkdown ? null : docsIntegrationFromPath(docsPath);
  if (activeIntegration) {
    response.cookies.set(INTEGRATION_COOKIE, activeIntegration, {
      maxAge: 31_536_000,
      path: '/',
      sameSite: 'lax',
    });
  }

  return response;
}

export const config = {
  matcher: ['/docs/:path*', '/docs.md'],
};
