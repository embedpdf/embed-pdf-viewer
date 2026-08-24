import type { NextRequest } from 'next/server';

const defaultPlatformUrl = 'http://127.0.0.1:4000';

export async function proxyPlatformRequest(
  request: NextRequest,
  path: readonly string[],
): Promise<Response> {
  const baseUrl = process.env.CLOUDPDF_PLATFORM_INTERNAL_URL ?? defaultPlatformUrl;
  const target = new URL(`/${path.map(encodeURIComponent).join('/')}`, baseUrl);
  target.search = request.nextUrl.search;

  const requestHeaders = new Headers(request.headers);
  requestHeaders.delete('connection');
  requestHeaders.delete('content-length');
  requestHeaders.set('host', target.host);
  requestHeaders.set('x-forwarded-host', request.nextUrl.host);
  requestHeaders.set('x-forwarded-proto', request.nextUrl.protocol.replace(':', ''));

  const method = request.method.toUpperCase();
  const response = await fetch(target, {
    body: method === 'GET' || method === 'HEAD' ? undefined : await request.arrayBuffer(),
    headers: requestHeaders,
    method,
    redirect: 'manual',
  });

  const responseHeaders = new Headers(response.headers);
  responseHeaders.delete('content-encoding');
  responseHeaders.delete('content-length');
  responseHeaders.delete('transfer-encoding');

  return new Response(response.body, {
    headers: responseHeaders,
    status: response.status,
    statusText: response.statusText,
  });
}
