/** The revocation source a page uses: what it sends its route, and how it reads what comes back. */
import { describe, expect, test } from 'vitest';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import { httpRevocationSource } from '../../src/index';

const route = 'https://app.example/api/revocation';
const ANSWER = Uint8Array.from([0x30, 0x03, 0x0a, 0x01, 0x00]);
const QUESTION = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x07]);
const ocsp = { kind: 'ocsp', url: 'http://ocsp.example.com/', body: QUESTION } as const;

interface Seen {
  url: string;
  method: string | undefined;
  headers: Record<string, string>;
  body: unknown;
}

/** A `fetch` that stands in for the route: each call is recorded and answered by `answer`. */
function fakeRoute(answer: (seen: Seen, before: number) => Response | Promise<Response>) {
  const seen: Seen[] = [];
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const headers: Record<string, string> = {};
    new Headers(init?.headers).forEach((value, name) => (headers[name] = value));
    const call: Seen = {
      url: String(input),
      method: init?.method,
      headers,
      body: JSON.parse(String(init?.body)),
    };
    seen.push(call);
    return Promise.race([
      Promise.resolve(answer(call, seen.length - 1)),
      new Promise<Response>((_, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
      ),
    ]);
  }) as typeof globalThis.fetch;
  return { fetch, seen };
}

const refusal = (status: number, reason: string, message: string) =>
  new Response(JSON.stringify({ reason, message }), { status });

async function caught(run: () => Promise<unknown>): Promise<EngineError> {
  try {
    await run();
  } catch (error) {
    expect(EngineError.is(error)).toBe(true);
    return error as EngineError;
  }
  throw new Error('it did not fail');
}

describe('httpRevocationSource', () => {
  test('each question goes to the route as JSON, and the answer comes back as bytes', async () => {
    const { fetch, seen } = fakeRoute(() => new Response(new Uint8Array(ANSWER)));
    const source = httpRevocationSource({
      url: route,
      fetch,
      headers: { authorization: 'Bearer session' },
    });

    expect([...(await source.fetch(ocsp))]).toEqual([...ANSWER]);
    await source.fetch({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
    await source.fetch({ kind: 'issuer', url: 'http://ca.example.com/issuer.cer' });

    expect(seen.map((call) => call.body)).toEqual([
      {
        kind: 'ocsp',
        url: 'http://ocsp.example.com/',
        body: Buffer.from(QUESTION).toString('base64'),
      },
      { kind: 'crl', url: 'http://ca.example.com/root.crl' },
      { kind: 'issuer', url: 'http://ca.example.com/issuer.cer' },
    ]);
    expect(seen[0]).toMatchObject({ url: route, method: 'POST' });
    expect(seen[0]!.headers).toMatchObject({
      'content-type': 'application/json',
      authorization: 'Bearer session',
    });
  });

  test('it tries again when no answer came, and then says which address was asked', async () => {
    const flaky = fakeRoute((_, before) =>
      before === 0
        ? refusal(504, 'no-answer', 'ocsp.example.com did not answer')
        : new Response(new Uint8Array(ANSWER)),
    );
    expect([
      ...(await httpRevocationSource({ url: route, fetch: flaky.fetch }).fetch(ocsp)),
    ]).toEqual([...ANSWER]);
    expect(flaky.seen).toHaveLength(2);

    for (const answer of [
      () => refusal(504, 'no-answer', 'ocsp.example.com did not answer within 10000 ms'),
      () => new Response('busy', { status: 503 }),
      () => new Response('slow down', { status: 429 }),
      () => {
        throw new TypeError('Failed to fetch');
      },
    ]) {
      const down = fakeRoute(answer);
      const error = await caught(() =>
        httpRevocationSource({ url: route, fetch: down.fetch, retries: 2 }).fetch(ocsp),
      );
      expect(error.code).toBe(EngineErrorCode.Network);
      expect(error.details).toEqual({ source: 'http://ocsp.example.com/', route });
      expect(down.seen).toHaveLength(3);
    }
  });

  test('a route that takes too long is no answer', async () => {
    const slow = fakeRoute(() => new Promise<Response>(() => {}));
    const error = await caught(() =>
      httpRevocationSource({ url: route, fetch: slow.fetch, timeoutMs: 30, retries: 0 }).fetch(
        ocsp,
      ),
    );
    expect(error.code).toBe(EngineErrorCode.Network);
    expect(error.message).toMatch(/no reply within 30 ms/);
  });

  test('what the route refuses fails at once, with its reason', async () => {
    const refusing = fakeRoute(() =>
      refusal(403, 'not-allowed', '10.0.0.1 is a private or local address'),
    );
    const error = await caught(() =>
      httpRevocationSource({ url: route, fetch: refusing.fetch, retries: 3 }).fetch({
        kind: 'crl',
        url: 'http://10.0.0.1/root.crl',
      }),
    );
    expect(error.code).toBe(EngineErrorCode.SignatureRefused);
    expect(error.details).toEqual({
      source: 'http://10.0.0.1/root.crl',
      route,
      httpStatus: 403,
      reason: 'not-allowed',
    });
    expect(error.message).toMatch(/private or local address/);
    expect(refusing.seen).toHaveLength(1);

    // A route of your own that says no in its own way.
    const plain = fakeRoute(() => new Response('Unauthorized', { status: 401 }));
    const unauthorized = await caught(() =>
      httpRevocationSource({ url: route, fetch: plain.fetch }).fetch(ocsp),
    );
    expect(unauthorized.code).toBe(EngineErrorCode.SignatureRefused);
    expect(unauthorized.details).toMatchObject({ httpStatus: 401 });
    expect(unauthorized.message).toMatch(/HTTP 401/);
  });
});
