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
  matcher: '/docs/headless/:path*',
};
