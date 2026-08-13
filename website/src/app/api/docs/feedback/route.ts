import { frameworkFromDocsPath } from '@/lib/docs-feedback';

/**
 * Same-origin forwarder: the docs feedback widget posts here; this route
 * enriches the payload with build facts only the server knows (framework
 * from the docs path, the engine flavour this site documents, the deployed
 * revision and environment) and forwards it to the control-plane, which
 * validates, rate-limits, and stores it (DOCS-PLATFORM-ARCHITECTURE.md).
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 5_000;
const SITE_ENGINE = 'local';

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}

function deployEnvironment(): 'production' | 'preview' | 'development' {
  const env = process.env.VERCEL_ENV ?? process.env.NODE_ENV;
  if (env === 'production') return 'production';
  if (env === 'preview') return 'preview';
  return 'development';
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  const platformUrl = process.env.CLOUDPDF_PLATFORM_INTERNAL_URL;
  if (!platformUrl) {
    return Response.json({ ok: false, error: 'Feedback is not configured.' }, { status: 503 });
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ ok: false, error: 'Expected JSON.' }, { status: 415 });
  }

  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: 'Feedback is too large.' }, { status: 413 });
    }
    const parsed: unknown = JSON.parse(text);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('not an object');
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const path = typeof body.path === 'string' ? body.path : '';
  const enriched = {
    ...body,
    docsRevision:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
      process.env.GIT_COMMIT_SHA?.slice(0, 12) ??
      null,
    engine: SITE_ENGINE,
    environment: deployEnvironment(),
    framework: frameworkFromDocsPath(path),
  };

  const upstream = await fetch(new URL('/v1/public/docs-feedback', platformUrl), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      // The control-plane checks submissions against its trusted-origin
      // allowlist; pass the browser's own origin through.
      origin: request.headers.get('origin') ?? '',
    },
    body: JSON.stringify(enriched),
  }).catch(() => null);

  if (!upstream) {
    return Response.json({ ok: false, error: 'Feedback is unavailable.' }, { status: 502 });
  }

  if (upstream.status === 429) {
    return Response.json(
      { ok: false, error: 'Please wait before sending more feedback.' },
      { status: 429, headers: { 'retry-after': upstream.headers.get('retry-after') ?? '60' } },
    );
  }

  if (!upstream.ok && upstream.status !== 202) {
    return Response.json({ ok: false, error: 'Feedback was rejected.' }, { status: 400 });
  }

  return Response.json({ ok: true, id: body.id ?? null });
}
