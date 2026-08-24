import type { NextRequest } from 'next/server';

/**
 * Session probe for the header CTA ("Start building" vs "Open
 * dashboard"). Deliberately NOT a general platform proxy: it forwards
 * only GET /v1/me with the caller's cookie and returns only the
 * signed-in status, so the marketing site never becomes an API relay.
 */
export async function GET(request: NextRequest) {
  const base =
    process.env.CLOUDPDF_PLATFORM_INTERNAL_URL ?? 'http://127.0.0.1:4000';
  const cookie = request.headers.get('cookie');
  if (!cookie) {
    return Response.json({ signedIn: false }, { status: 401 });
  }

  try {
    const response = await fetch(`${base}/v1/me`, {
      cache: 'no-store',
      headers: { cookie },
    });
    return Response.json(
      { signedIn: response.ok },
      { status: response.ok ? 200 : 401 },
    );
  } catch {
    return Response.json({ signedIn: false }, { status: 401 });
  }
}
