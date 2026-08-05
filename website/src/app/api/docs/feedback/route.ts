import { validateFeedbackPayload } from '@/lib/docs-feedback';
import {
  FeedbackConfigurationError,
  FeedbackRateLimitError,
  saveDocsFeedback,
} from '@/lib/docs-feedback-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_BODY_BYTES = 5_000;

function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  return origin !== null && origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return Response.json({ ok: false, error: 'Invalid request origin.' }, { status: 403 });
  }

  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return Response.json({ ok: false, error: 'Expected JSON.' }, { status: 415 });
  }

  const declaredLength = Number(request.headers.get('content-length') ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return Response.json({ ok: false, error: 'Feedback is too large.' }, { status: 413 });
  }

  let body: unknown;
  try {
    const text = await request.text();
    if (new TextEncoder().encode(text).byteLength > MAX_BODY_BYTES) {
      return Response.json({ ok: false, error: 'Feedback is too large.' }, { status: 413 });
    }
    body = JSON.parse(text);
  } catch {
    return Response.json({ ok: false, error: 'Invalid JSON.' }, { status: 400 });
  }

  const validation = validateFeedbackPayload(body);
  if (!validation.ok) {
    if (validation.kind === 'bot') {
      return Response.json({ ok: true }, { status: 202 });
    }
    return Response.json({ ok: false, error: validation.message }, { status: 400 });
  }

  try {
    const saved = await saveDocsFeedback(validation.value, request);
    return Response.json({ ok: true, id: saved.id, revision: saved.docs_revision });
  } catch (error) {
    if (error instanceof FeedbackRateLimitError) {
      return Response.json(
        { ok: false, error: 'Please wait before sending more feedback.' },
        { status: 429, headers: { 'retry-after': '60' } },
      );
    }

    if (error instanceof FeedbackConfigurationError) {
      console.error('[docs-feedback] Database configuration is incomplete.');
      return Response.json(
        { ok: false, error: 'Feedback is temporarily unavailable.' },
        { status: 503 },
      );
    }

    console.error('[docs-feedback] Failed to save feedback.', error);
    return Response.json({ ok: false, error: 'Unable to save feedback.' }, { status: 500 });
  }
}
