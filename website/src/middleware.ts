import { NextResponse, type NextRequest } from 'next/server';

import { DEFAULT_FRAMEWORK, FRAMEWORK_COOKIE, isFramework } from '@/lib/frameworks';

/**
 * Bare headless URLs (/docs/headless/zoom) are courtesy doors, never linked
 * in crawlable HTML (DOCS-ARCHITECTURE.md, SEO model): redirect to the
 * visitor's persisted framework, or the default. Concrete framework URLs
 * pass straight through — the cookie NEVER changes what they render.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Public Markdown representations are served by a statically generated
  // Route Handler while retaining the discoverable `<page>.md` URL.
  if (pathname.startsWith('/docs/') && pathname.endsWith('.md')) {
    const url = request.nextUrl.clone();
    url.pathname = `/api/docs/markdown${pathname.slice(0, -3)}`;
    return NextResponse.rewrite(url);
  }

  const segments = pathname.split('/');
  // /docs/headless or /docs/headless/<not-a-framework>/…
  if (segments[2] === 'headless' && !isFramework(segments[3])) {
    const cookie = request.cookies.get(FRAMEWORK_COOKIE)?.value;
    const fw = isFramework(cookie) ? cookie : DEFAULT_FRAMEWORK;
    const rest = segments.slice(3).join('/');
    const url = request.nextUrl.clone();
    url.pathname = `/docs/headless/${fw}${rest ? `/${rest}` : ''}`;
    return NextResponse.redirect(url, 307);
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/docs/:path*',
};
