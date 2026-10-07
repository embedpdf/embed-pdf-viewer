import { describe, expect, test, vi } from 'vitest';
import { AbortError, EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { resolveResourceIdForPath, wirePaths } from '@embedpdf/engine-core/wire';
import { CloudObjectNumberPool } from '../src/document/CloudObjectNumberPool';
import { CloudWrites } from '../src/document/CloudWrites';
import { HttpClient } from '../src/transport/HttpClient';

/**
 * A document's writes go out one at a time, in the order they were called,
 * each under its `opId`; the session header goes only where the server
 * reads it; a write lost on the network goes again under the same key.
 */

const signal = (): AbortSignal => new AbortController().signal;
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

function newPool(): CloudObjectNumberPool {
  return new CloudObjectNumberPool({
    reserve: async () => ({ objectNumbers: [], expiresIn: 900 }),
  });
}

describe('the write line', () => {
  test('writes go out in the order they were called, one at a time, though an earlier one prepares longer', async () => {
    const writes = new CloudWrites(newPool());
    const sent: string[] = [];
    let inFlight = 0;
    let most = 0;
    const write = (name: string, prepareMs: number) =>
      writes.run(name, signal(), async (line) => {
        await new Promise((resolve) => setTimeout(resolve, prepareMs));
        return line.send(async () => {
          inFlight++;
          most = Math.max(most, inFlight);
          sent.push(name);
          await tick();
          inFlight--;
          return name;
        });
      });
    const results = await Promise.all([write('a', 30), write('b', 0), write('c', 10)]);
    expect(results).toEqual(['a', 'b', 'c']);
    expect(sent).toEqual(['a', 'b', 'c']);
    expect(most).toBe(1);
  });

  test('a write aborted while it waits lets the next go only after the ones before it', async () => {
    const writes = new CloudWrites(newPool());
    const sent: string[] = [];
    let release!: () => void;
    const first = writes.run('a', signal(), (line) =>
      line.send(async () => {
        await new Promise<void>((resolve) => (release = resolve));
        sent.push('a');
      }),
    );
    const abort = new AbortController();
    const second = writes.run('b', abort.signal, (line) => line.send(async () => sent.push('b')));
    const third = writes.run('c', signal(), (line) => line.send(async () => sent.push('c')));
    await tick();
    abort.abort();
    await expect(second).rejects.toBeInstanceOf(AbortError);
    await tick();
    expect(sent).toEqual([]);
    release();
    await Promise.all([first, third]);
    expect(sent).toEqual(['a', 'c']);
  });

  test('a write asks for a top-up while the pool is low, and its numbers go to the pool', async () => {
    const pool = newPool();
    const writes = new CloudWrites(pool);
    const options = await writes.run('op-1', signal(), (line) =>
      line.send(async (sent) => {
        sent.write?.onObjectNumbers?.([{ first: 40, count: 32 }]);
        return sent;
      }),
    );
    expect(options.write).toMatchObject({ opId: 'op-1', reserveObjectNumbers: 32 });
    pool.receive([], 900);
    expect(pool.held).toBe(32);
    const next = await writes.run('op-2', signal(), (line) => line.send(async (sent) => sent));
    expect(next.write?.reserveObjectNumbers).toBeUndefined();
  });

  test('the numbers a write names are spent when it commits, and the caller’s when it fails', async () => {
    const pool = newPool();
    pool.opened({ session: 'new', expiresIn: 900, objectNumbers: [{ first: 10, count: 3 }] });
    const writes = new CloudWrites(pool);
    const [spent, kept] = [pool.take()!, pool.take()!];
    await writes.run('ok', signal(), (line) => line.send(async () => 'ok'), [spent]);
    await expect(
      writes.run(
        'fails',
        signal(),
        () => Promise.reject(new EngineError(EngineErrorCode.Network, 'down')),
        [kept],
      ),
    ).rejects.toThrow('down');
    const lost: number[] = [];
    pool.onLost((event) => lost.push(...event.numbers));
    pool.sync({ held: [{ first: 12, count: 1 }], expiresIn: 900 });
    // Off the server's list: the spent one isn't reported, the kept one is.
    expect(lost).toEqual([kept]);
  });
});

describe('the transport', () => {
  function recordingFetch(respond: (call: number) => Response | Error) {
    const calls: Array<{ url: string; headers: Headers; method: string }> = [];
    const fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(url),
        headers: new Headers(init?.headers),
        method: init?.method ?? 'GET',
      });
      const answer = respond(calls.length);
      if (answer instanceof Error) throw answer;
      return answer;
    }) as unknown as typeof globalThis.fetch;
    return { fetch, calls };
  }
  const ok = (headers: Record<string, string> = {}) =>
    new Response('{}', {
      status: 200,
      headers: { 'content-type': 'application/json', ...headers },
    });

  test('the session header goes only with writes, session calls and the stream', async () => {
    const { fetch, calls } = recordingFetch(() => ok());
    const http = new HttpClient({ baseUrl: 'https://api.test', fetch, sessionId: 'cloud:s1' });
    const parse = (raw: unknown) => raw;
    await http.getJson('/v1/docs/d1/layers/default/manifest', parse, signal());
    await http.postJson('/v1/docs/d1/layers/default/search', {}, parse, signal());
    await http.postJson('/v1/docs/d1/layers/default/access', {}, parse, signal(), {
      session: true,
    });
    await http.postJson('/v1/docs/d1/layers/default/pages/rotate', {}, parse, signal(), {
      write: { opId: 'op-1' },
    });
    await http.stream('/v1/docs/d1/layers/default/events', {}, signal());
    expect(calls.map((call) => call.headers.get('x-engine-session-id'))).toEqual([
      null,
      null,
      'cloud:s1',
      'cloud:s1',
      'cloud:s1',
    ]);
    expect(calls.map((call) => call.headers.get('idempotency-key'))).toEqual([
      null,
      null,
      null,
      'op-1',
      null,
    ]);
  });

  test('a write asks for a top-up and hands back the numbers the response names', async () => {
    const { fetch, calls } = recordingFetch(() =>
      ok({ 'EmbedPDF-Object-Numbers': '100-131, 140-141' }),
    );
    const http = new HttpClient({ baseUrl: 'https://api.test', fetch, sessionId: 'cloud:s1' });
    const received: unknown[] = [];
    await http.postJson('/v1/docs/d1/layers/default/x', {}, (raw) => raw, signal(), {
      write: { opId: 'op-1', reserveObjectNumbers: 32, onObjectNumbers: (r) => received.push(r) },
    });
    expect(calls[0]!.headers.get('embedpdf-reserve-object-numbers')).toBe('32');
    expect(received).toEqual([
      [
        { first: 100, count: 32 },
        { first: 140, count: 2 },
      ],
    ]);
  });

  test('a write lost on the network goes again under the same key; a read does not', async () => {
    const retried = recordingFetch((call) => (call === 1 ? new TypeError('fetch failed') : ok()));
    const http = new HttpClient({ baseUrl: 'https://api.test', fetch: retried.fetch });
    await http.postJson('/v1/docs/d1/layers/default/x', {}, (raw) => raw, signal(), {
      write: { opId: 'op-1' },
    });
    expect(retried.calls.map((call) => call.headers.get('idempotency-key'))).toEqual([
      'op-1',
      'op-1',
    ]);

    const read = recordingFetch(() => new TypeError('fetch failed'));
    const reader = new HttpClient({ baseUrl: 'https://api.test', fetch: read.fetch });
    await expect(
      reader.getJson('/v1/docs/d1/layers/default/manifest', (raw) => raw, signal()),
    ).rejects.toMatchObject({ code: EngineErrorCode.Network });
    expect(read.calls).toHaveLength(1);
  });

  test('a write never goes to the CDN, though its path looks like a read it serves', async () => {
    const { fetch, calls } = recordingFetch(() => ok());
    const http = new HttpClient({ baseUrl: 'https://api.test', fetch });
    const page = { kind: 'objectNumber', objectNumber: 3 } as const;
    const items = wirePaths.layerPageAnnotationsCreate('d1', 'default', page);
    const resource = resolveResourceIdForPath(items, 'd1', 'default');
    expect(resource).not.toBeNull();
    http.setCdnAccess({
      docId: 'd1',
      layerName: 'default',
      cdn: {
        adapter: 'custom-hmac',
        baseUrlOverrides: { [resource!]: 'https://cdn.test' },
        authHeader: null,
        signedQueryParams: null,
        signedCookies: null,
        signedPathPolicies: null,
      },
    });
    await http.getJson(items, (raw) => raw, signal());
    await http.postJson(items, {}, (raw) => raw, signal(), { write: { opId: 'op-1' } });
    expect(calls.map((call) => new URL(call.url).origin)).toEqual([
      'https://cdn.test',
      'https://api.test',
    ]);
  });
});
