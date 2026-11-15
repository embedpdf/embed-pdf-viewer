/**
 * The route a page asks certificate authorities through: what it passes on, and what it
 * refuses. The authority behind it is a function here; `http-round-trip.test.ts` puts real
 * HTTP on both sides.
 */
import { describe, expect, test } from 'vitest';

import { revocationRoute, type RevocationRouteOptions } from '../../src/server';

/**
 * One DER object: a sequence whose first element has tag `tag` and holds `count` bytes, or
 * `count` small integers when it is a sequence itself.
 */
function derObject(tag: number, count = 4): Uint8Array {
  const contents =
    tag === 0x30
      ? new Array<number[]>(count).fill([0x02, 0x01, 0x01]).flat()
      : new Array<number>(count).fill(1);
  const inner = [tag, contents.length, ...contents];
  return Uint8Array.from([0x30, inner.length, ...inner]);
}
const OCSP_ANSWER = derObject(0x0a, 1); // begins with its status
const LIST = derObject(0x30); // begins with what was signed
const CERTIFICATE = derObject(0x30, 6);
const BUNDLE = derObject(0x06);
const OCSP_QUESTION = Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x07]);
const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

interface Call {
  url: string;
  method: string;
  headers: Headers;
  body: Uint8Array | null;
  redirect: RequestRedirect | undefined;
}

/** A route whose authorities are `upstream`, with every call it makes recorded. */
function routeOver(
  upstream: (call: Call) => Response | Promise<Response>,
  options: RevocationRouteOptions = {},
) {
  const calls: Call[] = [];
  const route = revocationRoute({
    lookup: async () => ['93.184.216.34'],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const call: Call = {
        url: String(input),
        method: init?.method ?? 'GET',
        headers: new Headers(init?.headers),
        body: init?.body ? new Uint8Array(init.body as ArrayBuffer) : null,
        redirect: init?.redirect,
      };
      calls.push(call);
      // A call that is given up on fails, as `fetch` does.
      return Promise.race([
        Promise.resolve(upstream(call)),
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        ),
      ]);
    }) as typeof fetch,
    ...options,
  });
  const ask = async (question: unknown, init: RequestInit = {}) => {
    const response = await route(
      new Request('https://app.example/api/revocation', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: typeof question === 'string' ? question : JSON.stringify(question),
        ...init,
      }),
    );
    return {
      status: response.status,
      type: response.headers.get('content-type'),
      bytes: new Uint8Array(await response.clone().arrayBuffer()),
      said: response.status === 200 ? null : ((await response.json()) as Record<string, string>),
    };
  };
  return { ask, calls };
}

const answering = (bytes: Uint8Array, headers: Record<string, string> = {}) =>
  new Response(new Uint8Array(bytes), { status: 200, headers });

describe('revocationRoute', () => {
  test('an OCSP question is passed on as it is, and the answer comes back as it is', async () => {
    const { ask, calls } = routeOver(() => answering(OCSP_ANSWER));
    const reply = await ask({
      kind: 'ocsp',
      url: 'http://ocsp.example.com/status',
      body: base64(OCSP_QUESTION),
    });
    expect(reply.status).toBe(200);
    expect(reply.type).toBe('application/ocsp-response');
    expect([...reply.bytes]).toEqual([...OCSP_ANSWER]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      url: 'http://ocsp.example.com/status',
      method: 'POST',
      redirect: 'manual',
    });
    expect(calls[0]!.headers.get('content-type')).toBe('application/ocsp-request');
    expect([...calls[0]!.body!]).toEqual([...OCSP_QUESTION]);
  });

  test('a list and an issuer certificate are fetched', async () => {
    const { ask, calls } = routeOver((call) =>
      answering(
        call.url.endsWith('.crl') ? LIST : call.url.endsWith('.p7c') ? BUNDLE : CERTIFICATE,
      ),
    );
    const list = await ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
    expect(list).toMatchObject({ status: 200, type: 'application/pkix-crl' });
    expect([...list.bytes]).toEqual([...LIST]);
    const certificate = await ask({ kind: 'issuer', url: 'http://ca.example.com/issuer.cer' });
    expect(certificate).toMatchObject({ status: 200, type: 'application/pkix-cert' });
    // Some authorities serve a bundle of certificates there.
    expect((await ask({ kind: 'issuer', url: 'http://ca.example.com/issuer.p7c' })).status).toBe(
      200,
    );
    expect(calls.map((call) => call.method)).toEqual(['GET', 'GET', 'GET']);
    expect(calls.every((call) => call.body === null)).toBe(true);
  });

  test('a request it cannot read is refused, and nobody is asked', async () => {
    const { ask, calls } = routeOver(() => answering(LIST));
    const crl = 'http://ca.example.com/root.crl';
    for (const [question, said] of [
      ['not json', /not JSON/],
      [{ kind: 'other', url: crl }, /`kind` must be/],
      [{ kind: 'crl' }, /`url` must be an address/],
      [{ kind: 'crl', url: 'not an address' }, /`url` must be an address/],
      [{ kind: 'ocsp', url: crl }, /needs its request/],
      [{ kind: 'ocsp', url: crl, body: '***' }, /not base64/],
      [null, /`kind` must be/],
    ] as const) {
      const reply = await ask(question);
      expect(reply.status, JSON.stringify(question)).toBe(400);
      expect(reply.said).toMatchObject({ reason: 'bad-request' });
      expect(reply.said!.message).toMatch(said);
    }
    expect((await ask({ kind: 'crl', url: crl }, { method: 'PUT' })).status).toBe(405);
    const large = await ask({ kind: 'crl', url: crl, padding: 'x'.repeat(70_000) });
    expect(large.status).toBe(400);
    expect(calls).toEqual([]);
  });

  test('an address that is not a public http or https one is never called', async () => {
    const { ask, calls } = routeOver(() => answering(LIST));
    for (const url of [
      'ftp://ca.example.com/root.crl',
      'file:///etc/passwd',
      'http://127.0.0.1/root.crl',
      'http://2130706433/root.crl',
      'http://[::1]/root.crl',
      'http://[::ffff:10.0.0.1]/root.crl',
      'http://169.254.169.254/latest/meta-data/',
      'http://192.168.1.1/root.crl',
      'http://localhost:8080/root.crl',
      'http://intranet/root.crl',
      'http://user:secret@ca.example.com/root.crl',
    ]) {
      const reply = await ask({ kind: 'crl', url });
      expect(reply.status, url).toBe(403);
      expect(reply.said, url).toMatchObject({ reason: 'not-allowed' });
    }
    expect(calls).toEqual([]);
  });

  test('a name that leads to a private address is never called', async () => {
    const { ask, calls } = routeOver(() => answering(LIST), {
      lookup: async (name) => (name === 'rebound.example.com' ? ['10.0.0.9'] : ['93.184.216.34']),
    });
    const reply = await ask({ kind: 'crl', url: 'http://rebound.example.com/root.crl' });
    expect(reply.status).toBe(403);
    expect(reply.said!.message).toMatch(/leads to 10\.0\.0\.9/);
    expect(calls).toEqual([]);
    expect((await ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' })).status).toBe(200);
  });

  describe('redirects', () => {
    const to = (location: string, status = 302) =>
      new Response(null, { status, headers: { location } });

    test('a redirect to a public address is followed, and checked like the first one', async () => {
      const { ask, calls } = routeOver((call) =>
        call.url === 'http://ca.example.com/root.crl'
          ? to('https://cdn.example.net/lists/root.crl')
          : answering(LIST),
      );
      expect((await ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' })).status).toBe(200);
      expect(calls.map((call) => call.url)).toEqual([
        'http://ca.example.com/root.crl',
        'https://cdn.example.net/lists/root.crl',
      ]);
    });

    test('a redirect to a private address, a local name or another scheme is not followed', async () => {
      for (const location of [
        'http://10.0.0.5/root.crl',
        'http://localhost/root.crl',
        'http://[::1]/root.crl',
        'ftp://ca.example.com/root.crl',
        '//169.254.169.254/latest/meta-data/',
      ]) {
        const { ask, calls } = routeOver(() => to(location));
        const reply = await ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
        expect(reply.status, location).toBe(403);
        expect(reply.said, location).toMatchObject({ reason: 'not-allowed' });
        expect(calls.map((call) => call.url)).toEqual(['http://ca.example.com/root.crl']);
      }
    });

    test('a chain of redirects ends, and a redirect to nowhere is an error of the authority', async () => {
      const loop = routeOver((call) => to(`${call.url}x`));
      const reply = await loop.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
      expect(reply.status).toBe(502);
      expect(reply.said!.message).toMatch(/redirects more than 3 times/);
      expect(loop.calls).toHaveLength(4);

      const nowhere = routeOver(() => new Response(null, { status: 302 }));
      expect(
        (await nowhere.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' })).status,
      ).toBe(502);
    });

    test('an OCSP question follows only a redirect that keeps it a question', async () => {
      const kept = routeOver((call) =>
        call.url.endsWith('/moved')
          ? answering(OCSP_ANSWER)
          : to('http://ocsp.example.com/moved', 307),
      );
      const question = {
        kind: 'ocsp',
        url: 'http://ocsp.example.com/',
        body: base64(OCSP_QUESTION),
      };
      expect((await kept.ask(question)).status).toBe(200);
      expect(kept.calls[1]).toMatchObject({ method: 'POST' });
      expect([...kept.calls[1]!.body!]).toEqual([...OCSP_QUESTION]);

      const dropped = routeOver(() => to('http://ocsp.example.com/moved', 302));
      const reply = await dropped.ask(question);
      expect(reply.status).toBe(502);
      expect(reply.said!.message).toMatch(/drops it/);
      expect(dropped.calls).toHaveLength(1);
    });
  });

  test('an answer that is too large is not passed on', async () => {
    const big = new Uint8Array(5000);
    const declared = routeOver(() => answering(LIST, { 'content-length': '999999' }), {
      maxBytes: 4096,
    });
    const reply = await declared.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
    expect(reply.status).toBe(422);
    expect(reply.said).toMatchObject({ reason: 'too-large' });
    // An answer that does not say how long it is, or says less, is cut off as it arrives.
    const streamed = routeOver(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(big.slice(0, 3000));
              controller.enqueue(big.slice(3000));
              controller.close();
            },
          }),
        ),
      { maxBytes: 4096 },
    );
    expect(
      (await streamed.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' })).said,
    ).toMatchObject({
      reason: 'too-large',
    });
  });

  test('an answer that is not what was asked for is not passed on', async () => {
    const html = new TextEncoder().encode('<html><body>secret dashboard</body></html>');
    const json = new TextEncoder().encode('{"password":"hunter2"}');
    for (const [kind, bytes, said] of [
      ['crl', html, /not one DER object/],
      ['issuer', json, /not one DER object/],
      ['crl', Uint8Array.from([...LIST, 0]), /not one DER object/],
      ['ocsp', LIST, /not an OCSP response/],
      ['crl', OCSP_ANSWER, /not a list/],
      ['issuer', OCSP_ANSWER, /not a certificate/],
      ['crl', new Uint8Array(), /not one DER object/],
    ] as const) {
      const { ask } = routeOver(() => answering(bytes));
      const reply = await ask({
        kind,
        url: 'http://ca.example.com/thing',
        ...(kind === 'ocsp' ? { body: base64(OCSP_QUESTION) } : {}),
      });
      expect(reply.status, kind).toBe(422);
      expect(reply.said).toMatchObject({ reason: 'wrong-type' });
      expect(reply.said!.message).toMatch(said);
      // Nothing of what the address served comes back.
      expect(new TextDecoder().decode(reply.bytes)).not.toMatch(/secret|hunter2/);
    }
  });

  test('an authority that answers with an error, breaks off or says nothing in time', async () => {
    const failing = routeOver(() => new Response('gone', { status: 404 }));
    const notFound = await failing.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
    expect(notFound.status).toBe(502);
    expect(notFound.said).toMatchObject({ reason: 'upstream-status' });
    expect(notFound.said!.message).toMatch(/HTTP 404/);

    const down = routeOver(() => {
      throw new TypeError('connect ECONNREFUSED');
    });
    const refused = await down.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
    expect(refused.status).toBe(504);
    expect(refused.said).toMatchObject({ reason: 'no-answer' });

    const slow = routeOver(() => new Promise<Response>(() => {}), { timeoutMs: 30 });
    const late = await slow.ask({ kind: 'crl', url: 'http://ca.example.com/root.crl' });
    expect(late.status).toBe(504);
    expect(late.said!.message).toMatch(/within 30 ms/);
  });

  describe('keeping answers', () => {
    const question = { kind: 'ocsp', url: 'http://ocsp.example.com/', body: base64(OCSP_QUESTION) };

    test('an answer is kept for as long as its authority allows, per question', async () => {
      const { ask, calls } = routeOver(() =>
        answering(OCSP_ANSWER, { 'cache-control': 'public, max-age=3600' }),
      );
      expect((await ask(question)).status).toBe(200);
      const again = await ask(question);
      expect([...again.bytes]).toEqual([...OCSP_ANSWER]);
      expect(calls).toHaveLength(1);
      // Another question about another certificate is asked.
      await ask({ ...question, body: base64(Uint8Array.from([0x30, 0x03, 0x02, 0x01, 0x08])) });
      expect(calls).toHaveLength(2);
    });

    test('an answer its authority does not let anyone keep is asked for each time', async () => {
      for (const headers of [
        {},
        { 'cache-control': 'no-store' },
        { 'cache-control': 'max-age=0' },
      ] as Record<string, string>[]) {
        const { ask, calls } = routeOver(() => answering(OCSP_ANSWER, headers));
        await ask(question);
        await ask(question);
        expect(calls, JSON.stringify(headers)).toHaveLength(2);
      }
    });

    test('an `Expires` date counts, a refusal is never kept, and `cache: false` keeps nothing', async () => {
      const expires = routeOver(() =>
        answering(OCSP_ANSWER, { expires: new Date(Date.now() + 60_000).toUTCString() }),
      );
      await expires.ask(question);
      await expires.ask(question);
      expect(expires.calls).toHaveLength(1);

      let first = true;
      const recovering = routeOver(() => {
        if (!first) return answering(OCSP_ANSWER, { 'cache-control': 'max-age=60' });
        first = false;
        return new Response('busy', { status: 503, headers: { 'cache-control': 'max-age=60' } });
      });
      expect((await recovering.ask(question)).status).toBe(502);
      expect((await recovering.ask(question)).status).toBe(200);

      const off = routeOver(() => answering(OCSP_ANSWER, { 'cache-control': 'max-age=3600' }), {
        cache: false,
      });
      await off.ask(question);
      await off.ask(question);
      expect(off.calls).toHaveLength(2);
    });

    test('a cache of your own is asked first and told what to keep', async () => {
      const kept = new Map<string, Uint8Array>();
      const told: number[] = [];
      const { ask, calls } = routeOver(
        () => answering(OCSP_ANSWER, { 'cache-control': 'max-age=120' }),
        {
          cache: {
            get: async (key) => kept.get(key) ?? null,
            set: async (key, answer, seconds) => {
              kept.set(key, answer);
              told.push(seconds);
            },
          },
        },
      );
      await ask(question);
      await ask(question);
      expect(calls).toHaveLength(1);
      expect(told).toEqual([120]);
    });
  });
});
