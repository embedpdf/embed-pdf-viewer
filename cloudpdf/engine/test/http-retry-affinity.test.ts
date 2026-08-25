import { describe, expect, test, vi } from 'vitest';
import { AbortError } from '@embedpdf/engine-core/runtime';
import { HttpClient } from '../src/transport/HttpClient';

/**
 * Transport backpressure + affinity header (plan
 * `2026-08-26-client-backpressure-affinity-header.md`).
 *
 * Retry is keyed on OUR 503 codes (`EngineBusy`, `EngineRestarting`) —
 * both mean NOTHING HAPPENED server-side, so retrying is
 * method-agnostic-safe. Foreign 503s keep their old semantics.
 */

type FetchStep =
  | { status: number; body?: unknown; headers?: Record<string, string> }
  | ((url: string, init: RequestInit) => Response);

function scriptedFetch(steps: FetchStep[]): {
  fetch: typeof globalThis.fetch;
  calls: Array<{ url: string; init: RequestInit }>;
} {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]!;
    if (typeof step === 'function') return step(String(url), init ?? {});
    return new Response(step.body === undefined ? null : JSON.stringify(step.body), {
      status: step.status,
      headers: { 'content-type': 'application/json', ...(step.headers ?? {}) },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const busy503 = (retryAfter = '0'): FetchStep => ({
  status: 503,
  body: { error: { code: 'EngineBusy', message: 'shed' } },
  headers: { 'retry-after': retryAfter },
});

function client(fetch: typeof globalThis.fetch, extra: Record<string, unknown> = {}): HttpClient {
  return new HttpClient({ baseUrl: 'https://api.example.test', fetch, ...extra });
}

const signal = (): AbortSignal => new AbortController().signal;

describe('code-keyed 503 retry', () => {
  test('EngineBusy then 200 → one retry, result returned', async () => {
    const { fetch, calls } = scriptedFetch([busy503(), { status: 200, body: { ok: true } }]);
    const retries: Array<{ code: string; attempt: number }> = [];
    const http = client(fetch, {
      onRetry: (i: { code: string; attempt: number }) => retries.push(i),
    });
    const out = await http.getJson('/v1/docs/d1/head', (raw) => raw as { ok: boolean }, signal());
    expect(out).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
    expect(retries).toEqual([{ code: 'EngineBusy', attempt: 0, ...retries[0] }]);
  });

  test('EngineRestarting retries too — mutations included (nothing was applied)', async () => {
    const { fetch, calls } = scriptedFetch([
      {
        status: 503,
        body: { error: { code: 'EngineRestarting', message: 'respawning' } },
        headers: { 'retry-after': '0' },
      },
      { status: 200, body: { done: 1 } },
    ]);
    const http = client(fetch);
    const out = await http.postJson(
      '/v1/docs/d1/x',
      { a: 1 },
      (raw) => raw as { done: number },
      signal(),
    );
    expect(out).toEqual({ done: 1 });
    expect(calls).toHaveLength(2);
    // The body was re-sent equivalently on the retry.
    expect(calls[1]!.init.body).toBe(calls[0]!.init.body);
  });

  test('a FOREIGN 503 (no engine code) keeps old semantics — no retry', async () => {
    const { fetch, calls } = scriptedFetch([
      { status: 503, body: { message: 'proxy says no' } },
      { status: 200, body: { never: true } },
    ]);
    const http = client(fetch);
    await expect(http.getJson('/v1/docs/d1/head', (raw) => raw, signal())).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  test('exhaustion: after 2 retries the third 503 surfaces as the error', async () => {
    const { fetch, calls } = scriptedFetch([busy503(), busy503(), busy503()]);
    const http = client(fetch);
    await expect(http.getJson('/v1/docs/d1/head', (raw) => raw, signal())).rejects.toThrow();
    expect(calls).toHaveLength(3); // 1 + MAX_RETRIES
  });

  test('abort during the wait rejects immediately with AbortError', async () => {
    const { fetch } = scriptedFetch([busy503('5'), { status: 200, body: {} }]);
    const http = client(fetch);
    const ac = new AbortController();
    const p = http.getJson('/v1/docs/d1/head', (raw) => raw, ac.signal);
    p.catch(() => undefined);
    await new Promise((r) => setTimeout(r, 20)); // inside the hinted wait
    ac.abort();
    await expect(p).rejects.toBeInstanceOf(AbortError);
  });

  test('Retry-After is honored (and capped)', async () => {
    const { fetch } = scriptedFetch([busy503('1'), { status: 200, body: { ok: 1 } }]);
    const http = client(fetch);
    const t0 = Date.now();
    await http.getJson('/v1/docs/d1/head', (raw) => raw, signal());
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(850); // 1s hint, −10% jitter, scheduling slack
    expect(elapsed).toBeLessThan(3_000);
  });
});

describe('X-CloudPDF-Doc emission (opt-in)', () => {
  test('default OFF: no header', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: {} }]);
    await client(fetch).getJson('/v1/docs/docZ/head', (raw) => raw, signal());
    expect(new Headers(calls[0]!.init.headers).get('x-cloudpdf-doc')).toBeNull();
  });

  test('enabled: doc paths carry the docId; non-doc paths do not', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: {} }]);
    const http = client(fetch, { docAffinityHeader: true });
    await http.getJson('/v1/docs/docZ/head', (raw) => raw, signal());
    expect(new Headers(calls[0]!.init.headers).get('x-cloudpdf-doc')).toBe('docZ');
    await http.getJson('/healthz', (raw) => raw, signal());
    expect(new Headers(calls[1]!.init.headers).get('x-cloudpdf-doc')).toBeNull();
  });

  test('the access bootstrap carries it via its PATH — no hint machinery', async () => {
    const { fetch, calls } = scriptedFetch([{ status: 200, body: {} }]);
    const http = client(fetch, { docAffinityHeader: true });
    await http.postJson('/v1/docs/docZ/access', { layerName: 'default' }, (raw) => raw, signal());
    expect(new Headers(calls[0]!.init.headers).get('x-cloudpdf-doc')).toBe('docZ');
  });
});
