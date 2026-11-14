import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import { EngineErrorCode, type Engine } from '@embedpdf/engine-core/runtime';

import { OID } from '../../src/cms/oids';
import { parseCmsInternal } from '../../src/cms/parse';
import { checkTimestampToken, signatureValueOf } from '../../src/cms/verify-timestamp';
import { createTestSigner, httpTimestampAuthority, sign, type RawSigner } from '../../src/index';
import { createOpenSslAuthority, hasOpenSsl, opensslVerifiesToken } from '../helpers/openssl';
import { createTimestampAuthorityIdentity } from '../helpers/pki';
import {
  fakeEndpoint,
  granted,
  honestAnswer,
  httpStatus,
  rejected,
  type SeenRequest,
} from '../helpers/responder';

const url = 'https://tsa.example.com/stamp';
const digest = new Uint8Array(32).map((_, i) => (i * 9 + 4) & 0xff);
const ask = { digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' } as const;
const stamped = { kind: 'digest', digest, algorithm: 'sha256' } as const;

describe('a timestamp authority over HTTP', () => {
  let authority: RawSigner;
  beforeAll(async () => {
    authority = (await createTimestampAuthorityIdentity('HTTP authority')).signer;
  });
  const honest = (request: SeenRequest) => honestAnswer(authority, request);

  test('sends a request for exactly what it was asked, and returns the token', async () => {
    const endpoint = fakeEndpoint(honest);
    const http = httpTimestampAuthority({
      url,
      fetch: endpoint.fetch,
      headers: { authorization: 'Bearer key' },
    });

    const token = await http.sign(ask);
    expect((await checkTimestampToken({ token, stamped })).verdict).toBe('valid');

    expect(endpoint.requests).toHaveLength(1);
    const { query, headers } = endpoint.requests[0]!;
    expect(endpoint.requests[0]!.url).toBe(url);
    expect(headers['content-type']).toBe('application/timestamp-query');
    expect(headers.authorization).toBe('Bearer key');
    expect(query.version).toBe(1);
    // The token must carry the authority's certificate, and answer this request and no other.
    expect(query.certReq).toBe(true);
    expect(query.nonce!.valueBlock.valueHexView).toHaveLength(8);
    expect(query.reqPolicy).toBeUndefined();
    expect(query.messageImprint.hashAlgorithm.algorithmId).toBe(OID.sha256);
    expect(Array.from(query.messageImprint.hashedMessage.valueBlock.valueHexView)).toEqual(
      Array.from(digest),
    );

    // Each request has a nonce of its own.
    await http.sign(ask);
    const nonces = endpoint.requests.map((seen) => seen.query.nonce!.valueBlock.toString());
    expect(nonces[0]).not.toBe(nonces[1]);
  });

  test("its hash is the default for sign(); a call's algorithm is what it asks for", async () => {
    const endpoint = fakeEndpoint(honest);
    expect(httpTimestampAuthority({ url, fetch: endpoint.fetch }).hash).toBe('sha256');
    const http = httpTimestampAuthority({ url, fetch: endpoint.fetch, hash: 'sha512' });
    expect(http.hash).toBe('sha512');

    const longer = new Uint8Array(48).fill(6);
    const token = await http.sign({ ...ask, digest: longer, algorithm: 'sha384' });
    expect(endpoint.requests[0]!.query.messageImprint.hashAlgorithm.algorithmId).toBe(OID.sha384);
    const check = await checkTimestampToken({
      token,
      stamped: { kind: 'digest', digest: longer, algorithm: 'sha384' },
    });
    expect(check.verdict).toBe('valid');
  });

  test('a policy is asked for, and a token under another policy is refused', async () => {
    const policy = '1.2.3.4.5.6';
    const obliging = fakeEndpoint(honest);
    await httpTimestampAuthority({ url, fetch: obliging.fetch, policy }).sign(ask);
    expect(obliging.requests[0]!.query.reqPolicy).toBe(policy);

    const stubborn = fakeEndpoint((request) =>
      honestAnswer(authority, request, { policy: '1.2.3.4.5.7' }),
    );
    await expect(
      httpTimestampAuthority({ url, fetch: stubborn.fetch, policy }).sign(ask),
    ).rejects.toMatchObject({
      code: EngineErrorCode.SignatureRefused,
      details: { authority: url, reason: 'profile-violation' },
    });
  });

  test('asked for a signature, it says where an authority goes', async () => {
    const endpoint = fakeEndpoint(honest);
    const http = httpTimestampAuthority({ url, fetch: endpoint.fetch });
    const refusal = http.sign({ ...ask, subFilter: 'ETSI.CAdES.detached' });
    await expect(refusal).rejects.toMatchObject({
      code: EngineErrorCode.InvalidArg,
      details: { authority: url },
    });
    await expect(refusal).rejects.toThrow(/pass it as `timestampAuthority`/);
    expect(endpoint.requests).toHaveLength(0);
  });

  describe('when no answer comes', () => {
    const unreachable = () => {
      throw new TypeError('fetch failed');
    };

    test('it tries once more, then fails with Network and the address', async () => {
      const endpoint = fakeEndpoint(unreachable);
      const refusal = httpTimestampAuthority({ url, fetch: endpoint.fetch }).sign(ask);
      await expect(refusal).rejects.toMatchObject({
        code: EngineErrorCode.Network,
        details: { authority: url },
      });
      await expect(refusal).rejects.toThrow(url);
      expect(endpoint.requests).toHaveLength(2);
    });

    test('retries says how often: none means one attempt', async () => {
      const endpoint = fakeEndpoint(unreachable);
      await expect(
        httpTimestampAuthority({ url, fetch: endpoint.fetch, retries: 0 }).sign(ask),
      ).rejects.toMatchObject({ code: EngineErrorCode.Network });
      expect(endpoint.requests).toHaveLength(1);
    });

    test('an authority that answers the second time is good enough', async () => {
      const endpoint = fakeEndpoint((request, before) =>
        before === 0 ? unreachable() : honest(request),
      );
      const token = await httpTimestampAuthority({ url, fetch: endpoint.fetch }).sign(ask);
      expect((await checkTimestampToken({ token, stamped })).verdict).toBe('valid');
      expect(endpoint.requests).toHaveLength(2);
      // The same request goes out again: the same nonce.
      expect(Array.from(endpoint.requests[1]!.body)).toEqual(
        Array.from(endpoint.requests[0]!.body),
      );
    });

    test('a busy server (HTTP 503, 429) counts as no answer', async () => {
      for (const status of [503, 429]) {
        const endpoint = fakeEndpoint((request, before) =>
          before === 0 ? httpStatus(status) : honest(request),
        );
        await httpTimestampAuthority({ url, fetch: endpoint.fetch }).sign(ask);
        expect(endpoint.requests).toHaveLength(2);
      }
    });

    test('an attempt that takes too long is given up', async () => {
      const hanging = ((_url: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        })) as typeof globalThis.fetch;
      const refusal = httpTimestampAuthority({
        url,
        fetch: hanging,
        timeoutMs: 20,
        retries: 0,
      }).sign(ask);
      await expect(refusal).rejects.toMatchObject({
        code: EngineErrorCode.Network,
        details: { authority: url },
      });
      await expect(refusal).rejects.toThrow(/no reply within 20 ms/);
    });
  });

  describe('when the authority says no, or answers something else', () => {
    /** Refused at once: the same request again would get the same answer. */
    const refusedAtOnce = async (
      answer: (request: SeenRequest) => Promise<Response> | Response,
      details: Record<string, unknown>,
    ) => {
      const endpoint = fakeEndpoint(answer);
      await expect(
        httpTimestampAuthority({ url, fetch: endpoint.fetch }).sign(ask),
      ).rejects.toMatchObject({
        code: EngineErrorCode.SignatureRefused,
        details: { authority: url, ...details },
      });
      expect(endpoint.requests).toHaveLength(1);
    };

    test('an HTTP refusal carries its status', async () => {
      await refusedAtOnce(() => httpStatus(401), { httpStatus: 401 });
      await refusedAtOnce(() => httpStatus(400), { httpStatus: 400 });
    });

    test('an RFC 3161 rejection carries the failure it names', async () => {
      await refusedAtOnce(() => rejected(0), { failInfo: 'badAlg' });
      await refusedAtOnce(() => rejected(15), { failInfo: 'unacceptedPolicy' });
    });

    test('a reply that is no timestamp response, or grants without a token', async () => {
      await refusedAtOnce(() => new Response('<html>busy</html>'), { reason: 'malformed' });
      await refusedAtOnce(() => granted(null), { reason: 'malformed' });
      await refusedAtOnce(() => granted(new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05])), {
        reason: 'malformed',
      });
    });

    test('a token over another digest, or under another algorithm', async () => {
      await refusedAtOnce(
        (request) => honestAnswer(authority, request, { digest: digest.map((b) => b ^ 1) }),
        { reason: 'digest-mismatch' },
      );
      await refusedAtOnce(
        (request) =>
          honestAnswer(authority, request, { digest: new Uint8Array(48), hash: 'sha384' }),
        { reason: 'algorithm-mismatch' },
      );
    });

    test('a token that answers another request: no nonce, or not this one', async () => {
      await refusedAtOnce((request) => honestAnswer(authority, request, { nonce: undefined }), {
        reason: 'profile-violation',
      });
      await refusedAtOnce(
        (request) => honestAnswer(authority, request, { nonce: new Uint8Array(8).fill(0x11) }),
        { reason: 'profile-violation' },
      );
    });
  });
});

describe.skipIf(!hasOpenSsl)('against an OpenSSL authority', () => {
  /** A `fetch` that hands each request to `openssl ts -reply`, as its HTTP endpoint would. */
  const endpointOf = (openssl: ReturnType<typeof createOpenSslAuthority>) =>
    fakeEndpoint(
      (request) =>
        new Response(new Uint8Array(openssl.reply(request.body)), {
          headers: { 'content-type': 'application/timestamp-reply' },
        }),
    );

  test('OpenSSL reads the request and its token answers it', async () => {
    const openssl = createOpenSslAuthority('sha256');
    try {
      const endpoint = endpointOf(openssl);
      const token = await httpTimestampAuthority({ url, fetch: endpoint.fetch }).sign(ask);

      const check = await checkTimestampToken({ token, stamped });
      expect(check.verdict).toBe('valid');
      expect(Array.from(check.token!.parsed.signerCertificate)).toEqual(
        Array.from(openssl.certificate),
      );
      expect(opensslVerifiesToken({ token, digest, anchor: openssl.certificate }).ok).toBe(true);
    } finally {
      openssl.dispose();
    }
  });

  test('an algorithm the authority does not take comes back as its refusal', async () => {
    const openssl = createOpenSslAuthority('sha256');
    try {
      const endpoint = endpointOf(openssl);
      // The authority's `hash` says SHA-256; the call asks for SHA-384, and that is what goes out.
      const http = httpTimestampAuthority({ url, fetch: endpoint.fetch, hash: 'sha256' });
      await expect(
        http.sign({ ...ask, digest: new Uint8Array(48).fill(2), algorithm: 'sha384' }),
      ).rejects.toMatchObject({
        code: EngineErrorCode.SignatureRefused,
        details: { authority: url, failInfo: 'badAlg' },
      });
      expect(endpoint.requests[0]!.query.messageImprint.hashAlgorithm.algorithmId).toBe(OID.sha384);
      expect(endpoint.requests).toHaveLength(1);
    } finally {
      openssl.dispose();
    }
  });
});

describe('one authority object for both kinds of timestamp', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const fixtures = resolve(here, '..', '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
  const field = { kind: 'fqn', name: 'sig' } as const;
  let engine: Engine;
  let bytes: Uint8Array;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
  });
  afterAll(async () => {
    await engine.destroy();
  });

  test('it timestamps a signature, and it makes a document timestamp', async () => {
    const authority = (await createTimestampAuthorityIdentity('HTTP authority')).signer;
    const endpoint = fakeEndpoint((request) => honestAnswer(authority, request));
    const http = httpTimestampAuthority({ url, fetch: endpoint.fetch });

    const signed = await engine.open({ kind: 'bytes', id: 'http-signature', bytes });
    try {
      await sign(signed, { field, key: await createTestSigner(), timestampAuthority: http });
      const internal = parseCmsInternal(await signed.signatures.getContents(field));
      const check = await checkTimestampToken({
        token: internal.timestampTokens[0]!,
        stamped: { kind: 'bytes', bytes: signatureValueOf(internal.signerInfo) },
      });
      expect(check.verdict).toBe('valid');
    } finally {
      await signed.close();
    }

    const stampedDocument = await engine.open({ kind: 'bytes', id: 'http-document', bytes });
    try {
      const result = await sign(stampedDocument, { field, kind: 'timestamp', key: http });
      expect(result.signature).toMatchObject({ kind: 'timestamp', subFilter: 'ETSI.RFC3161' });
    } finally {
      await stampedDocument.close();
    }
    expect(endpoint.requests).toHaveLength(2);
  });

  test('an authority that cannot be reached fails the signing, and nothing is signed', async () => {
    const endpoint = fakeEndpoint(() => {
      throw new TypeError('fetch failed');
    });
    const http = httpTimestampAuthority({ url, fetch: endpoint.fetch, retries: 0 });
    const doc = await engine.open({ kind: 'bytes', id: 'http-unreachable', bytes });
    try {
      await expect(
        sign(doc, { field, key: await createTestSigner(), timestampAuthority: http }),
      ).rejects.toMatchObject({ code: EngineErrorCode.Network, details: { authority: url } });
      expect((await doc.signatures.list()).signatures[0]!.signed).toBe(false);
    } finally {
      await doc.close();
    }
  });
});
