import { describe, expect, test, vi } from 'vitest';
import { HttpClient } from '../src/transport/HttpClient';
import { keptToken } from '../src/transport/tokenKeeper';

/**
 * A token function runs once per token, not once per request: the client keeps its token until a
 * minute before the expiry the token carries, shares one call between requests that arrive
 * together, forgets a failed call, and asks again when the server refuses the kept token.
 */

/** An unsigned JWT that expires `expiresInSeconds` after `nowMs`, named `name` for the asserts. */
function jwt(name: string, nowMs: number, expiresInSeconds: number | null): string {
  const claims = {
    sub: name,
    doc_id: 'doc_1',
    ...(expiresInSeconds === null ? {} : { exp: Math.floor(nowMs / 1000) + expiresInSeconds }),
  };
  const part = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'none' })}.${part(claims)}.`;
}

/** A fetch that answers every request with `status`, and records each request's bearer. */
function recordingFetch(statusOf: (call: number) => number = () => 200) {
  const bearers: string[] = [];
  const fetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
    bearers.push(new Headers(init?.headers).get('Authorization') ?? '');
    return new Response('{}', {
      status: statusOf(bearers.length),
      headers: { 'content-type': 'application/json' },
    });
  }) as unknown as typeof globalThis.fetch;
  return { fetch, bearers };
}

const signal = (): AbortSignal => new AbortController().signal;
/** Lets a renewal started in the background finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const read = (http: HttpClient, path = '/v1/docs/doc_1/head') =>
  http.getJson(path, (raw) => raw, signal());

describe('keptToken', () => {
  test('runs the function once, then again in the background a minute before expiry', async () => {
    let now = 1_000_000_000_000;
    let issued = 0;
    const source = vi.fn(() => jwt(`t${++issued}`, now, 3600));
    const tokens = keptToken(source, () => now);

    const first = await tokens.token();
    await tokens.token();
    now += 58 * 60 * 1000;
    expect(await tokens.token()).toBe(first);
    expect(source).toHaveBeenCalledTimes(1);

    // In its last minute the kept token still goes out, while the next one is fetched.
    now += 60 * 1000;
    expect(await tokens.token()).toBe(first);
    expect(source).toHaveBeenCalledTimes(2);
    await settle();
    expect(await tokens.token()).not.toBe(first);
    expect(source).toHaveBeenCalledTimes(2);
  });

  test('a short-lived token is asked for again halfway', async () => {
    let now = 1_000_000_000_000;
    const source = vi.fn(() => jwt('short', now, 60));
    const tokens = keptToken(source, () => now);

    await tokens.token();
    now += 29 * 1000;
    await tokens.token();
    expect(source).toHaveBeenCalledTimes(1);
    now += 2 * 1000;
    await tokens.token();
    expect(source).toHaveBeenCalledTimes(2);
  });

  test('requests that arrive together share one call', async () => {
    let release!: (token: string) => void;
    const source = vi.fn(() => new Promise<string>((resolve) => (release = resolve)));
    const tokens = keptToken(source);

    const waiting = [tokens.token(), tokens.token(), tokens.token()];
    await vi.waitFor(() => expect(source).toHaveBeenCalled());
    release(jwt('shared', Date.now(), 3600));
    const answers = await Promise.all(waiting);

    expect(source).toHaveBeenCalledTimes(1);
    expect(new Set(answers).size).toBe(1);
  });

  test('a failed call is not kept: the next request asks again', async () => {
    const source = vi
      .fn<() => Promise<string>>()
      .mockRejectedValueOnce(new Error('token route down'))
      .mockResolvedValueOnce(jwt('after', Date.now(), 3600));
    const tokens = keptToken(source);

    await expect(tokens.token()).rejects.toThrow('token route down');
    await expect(tokens.token()).resolves.toContain('.');
    expect(source).toHaveBeenCalledTimes(2);
  });

  test('a failed renewal keeps the kept token going, and waits 5 seconds to try again', async () => {
    let now = 1_000_000_000_000;
    const first = jwt('first', now, 3600);
    const source = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce(first)
      .mockRejectedValue(new Error('token route down'));
    const tokens = keptToken(source, () => now);
    await tokens.token();

    now += 59 * 60 * 1000;
    expect(await tokens.token()).toBe(first);
    await settle();
    expect(source).toHaveBeenCalledTimes(2);

    // Within 5 seconds of the failure, requests don't try again.
    now += 4 * 1000;
    expect(await tokens.token()).toBe(first);
    expect(await tokens.token()).toBe(first);
    expect(source).toHaveBeenCalledTimes(2);

    now += 2 * 1000;
    expect(await tokens.token()).toBe(first);
    await settle();
    expect(source).toHaveBeenCalledTimes(3);

    // Once it has really expired, a request waits for the function, and hears it failed.
    now += 60 * 1000;
    await expect(tokens.token()).rejects.toThrow('token route down');
  });

  test('a token without an expiry is kept until it is refused', async () => {
    let issued = 0;
    const source = vi.fn(() => jwt(`n${++issued}`, Date.now(), null));
    const tokens = keptToken(source);

    const first = await tokens.token();
    expect(await tokens.token()).toBe(first);
    expect(tokens.refused(first)).toBe(true);
    expect(await tokens.token()).not.toBe(first);
    expect(source).toHaveBeenCalledTimes(2);
  });
});

describe('HttpClient with a token function', () => {
  test('sends one token on every request, from one call', async () => {
    const { fetch, bearers } = recordingFetch();
    const source = vi.fn(() => jwt('doc', Date.now(), 3600));
    const http = new HttpClient({ baseUrl: 'https://api.example.test', fetch }).forDocument({
      sessionId: 's',
      token: source,
    });

    await read(http, '/v1/docs/doc_1/pages/0/render');
    await read(http, '/v1/docs/doc_1/pages/1/render');
    await read(http, '/v1/docs/doc_1/pages/0/text');

    expect(source).toHaveBeenCalledTimes(1);
    expect(new Set(bearers).size).toBe(1);
  });

  test('a refused token is asked for again once, and the request repeated', async () => {
    const { fetch, bearers } = recordingFetch((call) => (call === 1 ? 401 : 200));
    let issued = 0;
    const source = vi.fn(() => jwt(`t${++issued}`, Date.now(), 3600));
    const http = new HttpClient({ baseUrl: 'https://api.example.test', fetch, token: source });

    await read(http);

    expect(source).toHaveBeenCalledTimes(2);
    expect(bearers).toHaveLength(2);
    expect(bearers[0]).not.toBe(bearers[1]);
  });

  test('a second refusal is the answer: no loop', async () => {
    const { fetch, bearers } = recordingFetch(() => 401);
    const source = vi.fn(() => jwt('bad', Date.now(), 3600));
    const http = new HttpClient({ baseUrl: 'https://api.example.test', fetch, token: source });

    await expect(read(http)).rejects.toThrow();
    expect(bearers).toHaveLength(2);
  });

  test('a literal token is never asked for again', async () => {
    const { fetch, bearers } = recordingFetch(() => 401);
    const http = new HttpClient({
      baseUrl: 'https://api.example.test',
      fetch,
      token: 'literal',
    });

    await expect(read(http)).rejects.toThrow();
    expect(bearers).toEqual(['Bearer literal']);
  });

  test('keepToken: false asks the function on every request', async () => {
    const { fetch } = recordingFetch();
    const source = vi.fn(() => jwt('grant', Date.now(), 600));
    const http = new HttpClient({ baseUrl: 'https://api.example.test', fetch }).forDocument({
      sessionId: 's',
      token: source,
      keepToken: false,
    });

    await read(http);
    await read(http);

    expect(source).toHaveBeenCalledTimes(2);
  });

  test("a document without a token of its own shares the engine's kept token", async () => {
    const { fetch } = recordingFetch();
    const source = vi.fn(() => jwt('tenant', Date.now(), 3600));
    const engine = new HttpClient({ baseUrl: 'https://api.example.test', fetch, token: source });

    await read(engine.forDocument({ sessionId: 'a' }));
    await read(engine.forDocument({ sessionId: 'b' }));

    expect(source).toHaveBeenCalledTimes(1);
  });
});
