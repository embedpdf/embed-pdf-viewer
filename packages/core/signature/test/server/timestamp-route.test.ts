/** The route a page asks a timestamp authority through: it passes the request on and the reply back. */
import { beforeAll, describe, expect, test } from 'vitest';

import { checkTimestampToken } from '../../src/cms/verify-timestamp';
import { httpTimestampAuthority, type RawSigner } from '../../src/index';
import { timestampRoute } from '../../src/server';
import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import { createTimestampAuthorityIdentity } from '../helpers/pki';
import { fakeEndpoint, honestAnswer, httpStatus, type SeenRequest } from '../helpers/responder';

const authorityUrl = 'https://tsa.example.com/stamp';
const routeUrl = 'https://app.example/api/timestamp';
const digest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const ask = { digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' } as const;

describe('timestampRoute', () => {
  let authority: RawSigner;
  beforeAll(async () => {
    authority = (await createTimestampAuthorityIdentity('routed authority')).signer;
  });
  const honest = (request: SeenRequest) => honestAnswer(authority, request);
  /** A `fetch` for the page that reaches `route` and nothing else. */
  const through =
    (route: (request: Request) => Promise<Response>): typeof fetch =>
    (input, init) =>
      route(new Request(input as string, init));

  test('a page signs through it, and the authority gets what the page must not hold', async () => {
    const endpoint = fakeEndpoint(honest);
    const route = timestampRoute({
      url: authorityUrl,
      fetch: endpoint.fetch,
      headers: { authorization: 'Bearer the-authority-key' },
    });
    const token = await httpTimestampAuthority({ url: routeUrl, fetch: through(route) }).sign(ask);

    const check = await checkTimestampToken({
      token,
      stamped: { kind: 'digest', digest, algorithm: 'sha256' },
    });
    expect(check.verdict).toBe('valid');
    expect(endpoint.requests).toHaveLength(1);
    expect(endpoint.requests[0]).toMatchObject({ url: authorityUrl });
    expect(endpoint.requests[0]!.headers).toMatchObject({
      'content-type': 'application/timestamp-query',
      authorization: 'Bearer the-authority-key',
    });
  });

  test('what the authority says is passed back with its status', async () => {
    const refusing = timestampRoute({
      url: authorityUrl,
      fetch: fakeEndpoint(() => httpStatus(401)).fetch,
    });
    const error = await httpTimestampAuthority({ url: routeUrl, fetch: through(refusing) })
      .sign(ask)
      .catch((caught: unknown) => caught);
    expect(EngineError.is(error, EngineErrorCode.SignatureRefused)).toBe(true);
    expect((error as EngineError).details).toMatchObject({ httpStatus: 401 });
  });

  test('an authority that does not answer is a 504, which the page takes as no answer', async () => {
    const down = timestampRoute({
      url: authorityUrl,
      fetch: (async () => {
        throw new TypeError('connect ECONNREFUSED');
      }) as typeof fetch,
    });
    const reply = await down(new Request(routeUrl, { method: 'POST', body: new Uint8Array([1]) }));
    expect(reply.status).toBe(504);
    const error = await httpTimestampAuthority({ url: routeUrl, fetch: through(down), retries: 0 })
      .sign(ask)
      .catch((caught: unknown) => caught);
    expect(EngineError.is(error, EngineErrorCode.Network)).toBe(true);

    const slow = timestampRoute({
      url: authorityUrl,
      timeoutMs: 30,
      fetch: ((_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init?.signal?.addEventListener('abort', () => reject(new Error('aborted'))),
        )) as typeof fetch,
    });
    const late = await slow(new Request(routeUrl, { method: 'POST', body: new Uint8Array([1]) }));
    expect(late.status).toBe(504);
    expect(await late.text()).toMatch(/within 30 ms/);
  });

  test('it takes a POST with a request in it, and nothing else', async () => {
    const endpoint = fakeEndpoint(honest);
    const route = timestampRoute({ url: authorityUrl, fetch: endpoint.fetch });
    expect((await route(new Request(routeUrl))).status).toBe(405);
    expect((await route(new Request(routeUrl, { method: 'POST' }))).status).toBe(413);
    const large = new Request(routeUrl, { method: 'POST', body: new Uint8Array(70_000) });
    expect((await route(large)).status).toBe(413);
    expect(endpoint.requests).toEqual([]);
  });
});
