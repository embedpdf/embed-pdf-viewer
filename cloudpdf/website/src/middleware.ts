import { NextResponse, type NextRequest } from 'next/server';

import {
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
    const topic = rest || 'getting-started';
    const url = request.nextUrl.clone();
    url.pathname = `/docs/${product}/${variant}/${topic}${isMarkdown ? '.md' : ''}`;
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
  // Route Handler while retaining the discoverable `<page>.md` URL.
  if (pathname.startsWith('/docs/') && pathname.endsWith('.md')) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/docs/markdown${pathname.slice(0, -3)}`;
    return NextResponse.rewrite(url);
  }

  const activeIntegration = docsIntegrationFromPath(docsPath);
  if (activeIntegration) {
    const response = NextResponse.next();
    response.cookies.set(INTEGRATION_COOKIE, activeIntegration, {
      maxAge: 31_536_000,
      path: '/',
      sameSite: 'lax',
    });
    return response;
  }

  return NextResponse.next();
}

export const config = {
  matcher: '/docs/:path*',
};
