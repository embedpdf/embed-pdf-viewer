/**
 * The whole way, over real HTTP: a document asks through `httpRevocationSource()`, which calls
 * the route on one local server, which calls the certificate authority on another. The
 * authority's certificates name an address that exists nowhere, as a real one names its own;
 * the route's `fetch` is the one place that knows where the test's authority listens.
 */
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';

import {
  addValidationInfo,
  createTestCertificateAuthority,
  createTestTimestampAuthority,
  httpRevocationSource,
  sign,
  validateSignatures,
  type TestCertificateAuthority,
  type TestSigner,
  type TestTimestampAuthority,
  type TrustPort,
} from '../../src/index';
import { revocationRoute } from '../../src/server';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const field = { kind: 'fqn', name: 'sig' } as const;
const AUTHORITY = 'http://test-authority.example';

const bodyOf = async (message: IncomingMessage): Promise<Uint8Array> => {
  const chunks: Buffer[] = [];
  for await (const chunk of message) chunks.push(chunk as Buffer);
  return new Uint8Array(Buffer.concat(chunks));
};
const listening = (server: Server): Promise<number> =>
  new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done((server.address() as AddressInfo).port));
  });
const closed = (server: Server): Promise<void> =>
  new Promise((done) => {
    server.closeAllConnections();
    server.close(() => done());
  });

describe('validation data over HTTP, through the route', () => {
  let engine: Engine;
  let bytes: Uint8Array;
  let opened = 0;
  let ca: TestCertificateAuthority;
  let signer: TestSigner;
  let timestampAuthority: TestTimestampAuthority;
  let trust: TrustPort;
  let authorityServer: Server;
  let appServer: Server;
  let routeUrl: string;
  /** What reached the authority: the method, the path and the content type of each call. */
  const reached: string[] = [];

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
    ca = await createTestCertificateAuthority({ url: AUTHORITY });
    signer = await ca.issueSigner({ commonName: 'Ada' });
    timestampAuthority = await createTestTimestampAuthority();
    trust = {
      anchors: async () => [ca.certificate],
      timestampAnchors: async () => [timestampAuthority.certificate],
    };

    // The certificate authority: an OCSP responder and a list, as real ones serve them.
    authorityServer = createServer((request, response) => {
      void (async () => {
        reached.push(
          `${request.method} ${request.url} ${request.headers['content-type'] ?? ''}`.trim(),
        );
        const url = `${AUTHORITY}${request.url}`;
        const answer =
          request.url === '/ocsp'
            ? await ca.revocation.fetch({ kind: 'ocsp', url, body: await bodyOf(request) })
            : await ca.revocation.fetch({ kind: 'crl', url });
        response.writeHead(200, {
          'content-type':
            request.url === '/ocsp' ? 'application/ocsp-response' : 'application/pkix-crl',
          'cache-control': 'public, max-age=600',
        });
        response.end(answer);
      })().catch(() => {
        response.writeHead(500).end();
      });
    });
    const authorityPort = await listening(authorityServer);

    // The app's server: one route, the one the package ships.
    const route = revocationRoute({
      // Nothing listens at the address the certificates name: this is where the authority is.
      lookup: async () => ['93.184.216.34'],
      fetch: (input, init) =>
        fetch(String(input).replace(AUTHORITY, `http://127.0.0.1:${authorityPort}`), init),
    });
    appServer = createServer((request, response) => {
      void (async () => {
        const reply = await route(
          new Request(`http://app.invalid${request.url}`, {
            method: request.method,
            headers: request.headers as Record<string, string>,
            body: new Uint8Array(await bodyOf(request)),
          }),
        );
        const headers: Record<string, string> = {};
        reply.headers.forEach((value, name) => (headers[name] = value));
        response.writeHead(reply.status, headers);
        response.end(new Uint8Array(await reply.arrayBuffer()));
      })().catch(() => {
        response.writeHead(500).end();
      });
    });
    routeUrl = `http://127.0.0.1:${await listening(appServer)}/api/revocation`;
  });
  afterAll(async () => {
    await engine.destroy();
    await closed(appServer);
    await closed(authorityServer);
  });

  async function withSignedDocument<T>(body: (doc: DocumentHandle) => Promise<T>): Promise<T> {
    const doc = await engine.open({ kind: 'bytes', id: `round-trip-${opened++}`, bytes });
    try {
      await sign(doc, { field, key: signer, timestampAuthority });
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  test('a document is made checkable for years, and the route keeps the answer for the next one', async () => {
    const revocation = httpRevocationSource({ url: routeUrl });

    await withSignedDocument(async (doc) => {
      const result = await addValidationInfo(doc, { trust, revocation });
      expect(result.added).toMatchObject({ ocspResponses: 1, crls: 0 });
      expect(result.verdicts[0]).toMatchObject({
        summary: 'valid',
        revocation: 'good',
        longTerm: { enabled: true },
      });
      // A reader with no network finds the same in the saved file.
      const saved = await doc.download();
      const reopened = await engine.open({
        kind: 'bytes',
        id: `round-trip-${opened++}`,
        bytes: saved,
      });
      try {
        const [offline] = await validateSignatures(reopened, { trust });
        expect(offline).toMatchObject({ summary: 'valid', longTerm: { enabled: true } });
      } finally {
        await reopened.close();
      }
    });
    expect(reached).toEqual(['POST /ocsp application/ocsp-request']);

    // The same certificate signs another document: the question is the same, byte for byte,
    // so the route answers from what it kept and the authority is not asked again.
    await withSignedDocument(async (doc) => {
      const result = await addValidationInfo(doc, { trust, revocation });
      expect(result.verdicts[0]!.longTerm.enabled).toBe(true);
    });
    expect(reached).toHaveLength(1);
  });

  test('the route refuses an address the page should not reach, and the call says so', async () => {
    const revocation = httpRevocationSource({ url: routeUrl });
    await expect(
      revocation.fetch({ kind: 'crl', url: 'http://169.254.169.254/latest/meta-data/' }),
    ).rejects.toMatchObject({
      code: 'SignatureRefused',
      details: { httpStatus: 403, reason: 'not-allowed' },
    });
  });

  test('a route that is not there is an address that did not answer', async () => {
    const revocation = httpRevocationSource({
      url: routeUrl.replace('/api/revocation', '/nowhere-listening').replace(/:\d+/, ':9'),
      retries: 0,
      timeoutMs: 2000,
    });
    await withSignedDocument(async (doc) => {
      await expect(addValidationInfo(doc, { trust, revocation })).rejects.toMatchObject({
        code: 'Network',
        details: { source: `${AUTHORITY}/ocsp` },
      });
      expect(await doc.signatures.getValidationInfo()).toEqual({
        certificates: [],
        ocspResponses: [],
        crls: [],
      });
    });
  });
});
