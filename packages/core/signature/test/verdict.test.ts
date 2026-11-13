import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';

import { timestampTokenAttribute } from '../src/cms/attach';
import { parseCmsInternal } from '../src/cms/parse';
import { addUnsignedAttribute } from '../src/cms/splice';
import { signatureValueOf } from '../src/cms/verify-timestamp';
import {
  buildDetachedCms,
  createTestSigner,
  createTestTimestampAuthority,
  sign,
  validateSignatures,
  verifyTimestampToken,
  type CmsSigner,
  type RawSigner,
  type TrustPort,
} from '../src/index';
import { createIdentity, createTimestampAuthorityIdentity, type TestIdentity } from './helpers/pki';
import { buildTestToken, type TestBinding } from './helpers/tokens';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const field = { kind: 'fqn', name: 'sig' } as const;
const DAY = 24 * 3600 * 1000;
const daysAgo = (days: number) => new Date(Date.now() - days * DAY);
const earliest = { kind: 'earliest-timestamp' } as const;
const sha256 = async (bytes: Uint8Array) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes)));

/** An authority whose tokens say `genTime`, and carry what `token` asks for. */
function authorityOf(
  identity: TestIdentity,
  token: { genTime?: Date; binding?: TestBinding; carriesCertificate?: boolean } = {},
): CmsSigner {
  return {
    kind: 'cms',
    sign: ({ digest, algorithm }) =>
      buildTestToken({ digest, hash: algorithm, authority: identity.signer, ...token }),
  };
}

describe('reading timestamps', () => {
  let engine: Engine;
  let bytes: Uint8Array;
  let opened = 0;
  /** A signer whose certificate was valid from 30 to 10 days ago. */
  let expiredSigner: TestIdentity;
  /** An authority whose certificate has been valid for 60 days, and still is. */
  let authority: TestIdentity;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
    expiredSigner = await createIdentity({
      commonName: 'a signer whose certificate ran out',
      ca: true,
      notBefore: daysAgo(30),
      notAfter: daysAgo(10),
    });
    authority = await createTimestampAuthorityIdentity('the authority', undefined, {
      notBefore: daysAgo(60),
    });
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function withDocument<T>(body: (doc: DocumentHandle) => Promise<T>): Promise<T> {
    const doc = await engine.open({ kind: 'bytes', id: `verdicts-${opened++}`, bytes });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  /** Add a document timestamp from `key`, in a signature field made for it. */
  async function stampDocument(doc: DocumentHandle, name: string, key: CmsSigner): Promise<void> {
    const page = (await doc.pages.list()).pages[0]!;
    await doc.forms.create({
      kind: 'signature',
      name,
      widget: { page: page.ref, rect: { x: 300, y: 600, width: 100, height: 30 } },
    } as never);
    await sign(doc, { field: { kind: 'fqn', name }, kind: 'timestamp', key });
  }

  /** Sign `field` with a CMS that carries `tokensFor(signature value)`, past the completion gate. */
  async function signCarrying(
    doc: DocumentHandle,
    signer: RawSigner,
    tokensFor: (signatureValue: Uint8Array) => Promise<Uint8Array[]>,
  ): Promise<void> {
    const prepared = await doc.signatures.prepare({ field, contentsSizeBytes: 16384 });
    const cms = await buildDetachedCms({
      digest: prepared.digest,
      hash: prepared.algorithm,
      profile: 'cades-b',
      signer,
    });
    const tokens = await tokensFor(signatureValueOf(parseCmsInternal(cms).signerInfo));
    const carrying = tokens.map(timestampTokenAttribute).reduce(addUnsignedAttribute, cms);
    await doc.signatures.complete({
      signingId: prepared.signingId,
      cms: carrying,
      expectedVersion: prepared.expectedVersion,
    });
  }

  const trusting = (signer: Uint8Array, ...authorities: Uint8Array[]): TrustPort => ({
    anchors: async () => [signer],
    timestampAnchors: async () => authorities,
  });

  describe("a signature's timestamp", () => {
    test('has a verdict of its own, beside the signature', async () => {
      await withDocument(async (doc) => {
        const signer = await createTestSigner();
        const stamper = await createTestTimestampAuthority();
        const before = Date.now();
        await sign(doc, { field, key: signer, timestampAuthority: stamper });

        const [verdict] = await validateSignatures(doc, {
          trust: trusting(signer.certificate, stamper.certificate),
        });
        expect(verdict!.summary).toBe('valid');
        expect(verdict!.timestamp).toMatchObject({
          summary: 'valid',
          cryptography: 'valid',
          trust: 'trusted',
          trustReason: null,
          validationTime: { kind: 'now' },
        });
        const stamp = verdict!.timestamp!;
        expect(Array.from(stamp.authorityCertificate!)).toEqual(Array.from(stamper.certificate));
        expect(new Date(stamp.genTime!).getTime()).toBeGreaterThanOrEqual(before - 1000);
        expect(new Date(stamp.genTime!).getTime()).toBeLessThanOrEqual(Date.now() + 1000);

        // Trust in the signer says nothing about the authority, and the other way round.
        const [signerOnly] = await validateSignatures(doc, {
          trust: { anchors: async () => [signer.certificate], timestampAnchors: async () => [] },
        });
        expect(signerOnly!.summary).toBe('valid');
        expect(signerOnly!.timestamp).toMatchObject({
          summary: 'valid-untrusted',
          trust: 'unknown',
        });
        const [nobody] = await validateSignatures(doc);
        expect(nobody!.timestamp).toMatchObject({ summary: 'valid-untrusted', trust: 'unknown' });
      });
    });

    test('is null on a signature that carries none', async () => {
      await withDocument(async (doc) => {
        await sign(doc, { field, key: await createTestSigner() });
        const [verdict] = await validateSignatures(doc);
        expect(verdict!.timestamp).toBeNull();
      });
    });

    test('never changes the summary of the signature it sits on', async () => {
      await withDocument(async (doc) => {
        const signer = await createTestSigner();
        // A token over other bytes: the engine's own complete() checks no cryptography.
        await signCarrying(doc, signer, async () => [
          await buildTestToken({ digest: new Uint8Array(32).fill(9), authority: authority.signer }),
        ]);
        const [verdict] = await validateSignatures(doc, {
          trust: trusting(signer.certificate, authority.certificate),
        });
        expect(verdict).toMatchObject({
          integrity: 'valid',
          cryptography: 'valid',
          summary: 'valid',
        });
        expect(verdict!.timestamp).toMatchObject({ summary: 'invalid', cryptography: 'invalid' });
        // What the token says is still there to show.
        expect(verdict!.timestamp!.genTime).not.toBeNull();
      });
    });

    test('that cannot be checked reads indeterminate, never invalid', async () => {
      const cases: [string, Parameters<typeof authorityOf>[1]][] = [
        [
          'a binding whose hash is unknown',
          { binding: { version: 2, hashOid: '2.16.840.1.101.3.4.2.8' } },
        ],
        ['no binding at all', { binding: null }],
        ['no certificate anywhere', { carriesCertificate: false }],
      ];
      for (const [name, token] of cases) {
        await withDocument(async (doc) => {
          const signer = await createTestSigner();
          await signCarrying(doc, signer, async (value) => [
            await authorityOf(authority, token).sign({
              digest: await sha256(value),
              algorithm: 'sha256',
              subFilter: 'ETSI.RFC3161',
            }),
          ]);
          const [verdict] = await validateSignatures(doc, {
            trust: trusting(signer.certificate, authority.certificate),
          });
          expect(verdict!.summary, name).toBe('valid');
          expect(verdict!.timestamp, name).toMatchObject({
            summary: 'indeterminate',
            cryptography: 'unsupported',
          });
        });
      }
    });

    test("is checked with the authority's certificate from the signature's own set", async () => {
      await withDocument(async (doc) => {
        const signer = await createTestSigner();
        const carryingAuthority: RawSigner = {
          ...signer,
          certificateChain: [signer.certificate, authority.certificate],
        };
        await signCarrying(doc, carryingAuthority, async (value) => [
          await buildTestToken({
            digest: await sha256(value),
            authority: authority.signer,
            carriesCertificate: false,
          }),
        ]);
        const [verdict] = await validateSignatures(doc, {
          trust: trusting(signer.certificate, authority.certificate),
        });
        expect(verdict!.timestamp).toMatchObject({ summary: 'valid', trust: 'trusted' });
        expect(Array.from(verdict!.timestamp!.authorityCertificate!)).toEqual(
          Array.from(authority.certificate),
        );
      });
    });

    test('when a signature carries several, the earliest valid one is its timestamp', async () => {
      await withDocument(async (doc) => {
        const signer = await createTestSigner();
        const tokenAt = async (value: Uint8Array, genTime: Date, digest?: Uint8Array) =>
          buildTestToken({
            digest: digest ?? (await sha256(value)),
            authority: authority.signer,
            genTime,
          });
        await signCarrying(doc, signer, async (value) => [
          await tokenAt(value, daysAgo(1)),
          await tokenAt(value, daysAgo(9), new Uint8Array(32).fill(1)),
          await tokenAt(value, daysAgo(5)),
        ]);
        const [verdict] = await validateSignatures(doc, {
          trust: trusting(signer.certificate, authority.certificate),
        });
        // The oldest token stamps something else; of the two that hold, the earlier one counts.
        expect(verdict!.timestamp!.summary).toBe('valid');
        const age = Date.now() - new Date(verdict!.timestamp!.genTime!).getTime();
        expect(Math.round(age / DAY)).toBe(5);
      });
    });
  });

  describe('a document timestamp', () => {
    test('reads back with a real answer, and its token is its timestamp', async () => {
      await withDocument(async (doc) => {
        const stamper = await createTestTimestampAuthority();
        await sign(doc, { field, kind: 'timestamp', key: stamper });

        const [verdict] = await validateSignatures(doc, {
          trust: { anchors: async () => [], timestampAnchors: async () => [stamper.certificate] },
        });
        expect(verdict).toMatchObject({
          integrity: 'valid',
          cryptography: 'valid',
          trust: 'trusted',
          summary: 'valid',
          validationTime: { kind: 'now' },
        });
        expect(verdict!.signature.kind).toBe('timestamp');
        expect(verdict!.timestamp).toMatchObject({ summary: 'valid', trust: 'trusted' });
        // `cms` is the token, parsed.
        expect(Array.from(verdict!.cms!.signerCertificate)).toEqual(
          Array.from(stamper.certificate),
        );

        const [untrusted] = await validateSignatures(doc);
        expect(untrusted).toMatchObject({
          integrity: 'valid',
          cryptography: 'valid',
          trust: 'unknown',
          summary: 'valid-untrusted',
        });
        expect(untrusted!.timestamp!.summary).toBe('valid-untrusted');
      });
    });

    test("an authority's anchor is what makes it trusted: a signer's anchor does not", async () => {
      await withDocument(async (doc) => {
        const stamper = await createTestTimestampAuthority();
        await sign(doc, { field, kind: 'timestamp', key: stamper });
        const [verdict] = await validateSignatures(doc, {
          trust: {
            anchors: async () => [stamper.certificate],
            timestampAnchors: async () => [authority.certificate],
          },
        });
        expect(verdict).toMatchObject({ trust: 'untrusted', summary: 'valid-untrusted' });
      });
    });
  });

  describe('judging at the earliest trusted timestamp', () => {
    test('a signer whose certificate ran out is trusted at its own timestamp', async () => {
      await withDocument(async (doc) => {
        const stamped = daysAgo(20);
        await sign(doc, {
          field,
          key: expiredSigner.signer,
          timestampAuthority: authorityOf(authority, { genTime: stamped }),
        });
        const trust = trusting(expiredSigner.certificate, authority.certificate);

        const [now] = await validateSignatures(doc, { trust });
        expect(now).toMatchObject({
          trust: 'untrusted',
          summary: 'valid-untrusted',
          validationTime: { kind: 'now' },
        });
        expect(now!.timestamp!.summary).toBe('valid');

        const [then] = await validateSignatures(doc, { trust, validationTime: earliest });
        expect(then).toMatchObject({
          trust: 'trusted',
          summary: 'valid',
          validationTime: {
            kind: 'timestamp',
            genTime: stamped.toISOString(),
            tokenVerified: true,
          },
        });
        // The authority has nothing after it to vouch for it: it is judged now.
        expect(then!.timestamp!.validationTime).toEqual({ kind: 'now' });
      });
    });

    test('a timestamp that is not trusted never becomes the validation time', async () => {
      await withDocument(async (doc) => {
        await sign(doc, {
          field,
          key: expiredSigner.signer,
          timestampAuthority: authorityOf(authority, { genTime: daysAgo(20) }),
        });
        const stranger = await createTimestampAuthorityIdentity('another authority');
        const [verdict] = await validateSignatures(doc, {
          trust: trusting(expiredSigner.certificate, stranger.certificate),
          validationTime: earliest,
        });
        expect(verdict!.timestamp!.summary).toBe('valid-untrusted');
        expect(verdict).toMatchObject({ trust: 'untrusted', validationTime: { kind: 'now' } });
      });
    });

    test('a token dated outside its certificate is not trusted, and is no validation time', async () => {
      await withDocument(async (doc) => {
        const young = await createTimestampAuthorityIdentity('a young authority', undefined, {
          notBefore: daysAgo(5),
        });
        await sign(doc, {
          field,
          key: expiredSigner.signer,
          timestampAuthority: authorityOf(young, { genTime: daysAgo(20) }),
        });
        const [verdict] = await validateSignatures(doc, {
          trust: trusting(expiredSigner.certificate, young.certificate),
          validationTime: earliest,
        });
        expect(verdict!.timestamp).toMatchObject({
          summary: 'valid-untrusted',
          trust: 'untrusted',
          trustReason: "the token is dated outside its authority certificate's validity",
        });
        expect(verdict).toMatchObject({ trust: 'untrusted', validationTime: { kind: 'now' } });
      });
    });

    test('a signature with no token of its own is judged at a document timestamp after it', async () => {
      await withDocument(async (doc) => {
        const stamped = daysAgo(20);
        await sign(doc, { field, key: expiredSigner.signer });
        await stampDocument(doc, 'stamp', authorityOf(authority, { genTime: stamped }));
        const trust = trusting(expiredSigner.certificate, authority.certificate);

        const [signature, documentStamp] = await validateSignatures(doc, {
          trust,
          validationTime: earliest,
        });
        expect(signature!.timestamp).toBeNull();
        expect(signature).toMatchObject({
          trust: 'trusted',
          validationTime: { kind: 'timestamp', genTime: stamped.toISOString() },
        });
        expect(documentStamp).toMatchObject({
          summary: 'valid',
          validationTime: { kind: 'now' },
        });

        // Without the option nothing is judged in the past.
        const [now] = await validateSignatures(doc, { trust });
        expect(now).toMatchObject({ trust: 'untrusted', validationTime: { kind: 'now' } });
      });
    });

    test('an authority whose certificate ran out is vouched for by a later document timestamp', async () => {
      const lapsed = await createTimestampAuthorityIdentity('a lapsed authority', undefined, {
        notBefore: daysAgo(40),
        notAfter: daysAgo(15),
      });
      const ownStamp = daysAgo(20);
      const laterStamp = daysAgo(18);
      const trust = trusting(expiredSigner.certificate, authority.certificate, lapsed.certificate);
      const signWithLapsed = (doc: DocumentHandle) =>
        sign(doc, {
          field,
          key: expiredSigner.signer,
          timestampAuthority: authorityOf(lapsed, { genTime: ownStamp }),
        });

      // On its own, the lapsed authority is judged now: nothing in the file proves its token old.
      await withDocument(async (doc) => {
        await signWithLapsed(doc);
        const [verdict] = await validateSignatures(doc, { trust, validationTime: earliest });
        expect(verdict!.timestamp).toMatchObject({
          summary: 'valid-untrusted',
          validationTime: { kind: 'now' },
        });
        expect(verdict).toMatchObject({ trust: 'untrusted', validationTime: { kind: 'now' } });
      });

      await withDocument(async (doc) => {
        await signWithLapsed(doc);
        await stampDocument(doc, 'stamp', authorityOf(authority, { genTime: laterStamp }));
        const [signature, documentStamp] = await validateSignatures(doc, {
          trust,
          validationTime: earliest,
        });
        expect(documentStamp).toMatchObject({ summary: 'valid', validationTime: { kind: 'now' } });
        // The token's authority is judged when the document timestamp says the token existed.
        expect(signature!.timestamp).toMatchObject({
          summary: 'valid',
          validationTime: { kind: 'timestamp', genTime: laterStamp.toISOString() },
        });
        // The signer is judged at the earlier of the two: its own timestamp.
        expect(signature).toMatchObject({
          trust: 'trusted',
          summary: 'valid',
          validationTime: { kind: 'timestamp', genTime: ownStamp.toISOString() },
        });
      });
    });

    test('two document timestamps: each certificate at the earliest one after what it signed', async () => {
      await withDocument(async (doc) => {
        const lapsed = await createTimestampAuthorityIdentity('a lapsed authority', undefined, {
          notBefore: daysAgo(40),
          notAfter: daysAgo(15),
        });
        const first = daysAgo(20);
        const second = daysAgo(18);
        await sign(doc, { field, key: expiredSigner.signer });
        await stampDocument(doc, 'first', authorityOf(lapsed, { genTime: first }));
        await stampDocument(doc, 'second', authorityOf(authority, { genTime: second }));

        const verdicts = await validateSignatures(doc, {
          trust: trusting(expiredSigner.certificate, authority.certificate, lapsed.certificate),
          validationTime: earliest,
        });
        const [signature, firstStamp, secondStamp] = verdicts;
        expect(secondStamp).toMatchObject({ summary: 'valid', validationTime: { kind: 'now' } });
        expect(firstStamp).toMatchObject({
          summary: 'valid',
          validationTime: { kind: 'timestamp', genTime: second.toISOString() },
        });
        expect(signature).toMatchObject({
          trust: 'trusted',
          validationTime: { kind: 'timestamp', genTime: first.toISOString() },
        });
      });
    });

    test('a time the caller names still judges the signer then, and the authority now', async () => {
      await withDocument(async (doc) => {
        await sign(doc, {
          field,
          key: expiredSigner.signer,
          timestampAuthority: authorityOf(authority, { genTime: daysAgo(20) }),
        });
        const named = {
          kind: 'timestamp',
          genTime: daysAgo(25).toISOString(),
          tokenVerified: true,
        } as const;
        const [verdict] = await validateSignatures(doc, {
          trust: trusting(expiredSigner.certificate, authority.certificate),
          validationTime: named,
        });
        expect(verdict).toMatchObject({ trust: 'trusted', validationTime: named });
        expect(verdict!.timestamp!.validationTime).toEqual({ kind: 'now' });
      });
    });
  });
});

describe('a timestamp token over any digest', () => {
  const digest = new Uint8Array(32).map((_, i) => (i * 3 + 1) & 0xff);

  test('verifies, and is trusted when its authority is', async () => {
    const stamper = await createTestTimestampAuthority();
    const token = await stamper.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });

    const trusted = await verifyTimestampToken({
      token,
      digest,
      algorithm: 'sha256',
      trust: { anchors: async () => [], timestampAnchors: async () => [stamper.certificate] },
    });
    expect(trusted).toMatchObject({
      summary: 'valid',
      cryptography: 'valid',
      trust: 'trusted',
      validationTime: { kind: 'now' },
    });
    expect(Array.from(trusted.authorityCertificate!)).toEqual(Array.from(stamper.certificate));

    for (const trust of [undefined, null]) {
      const unknown = await verifyTimestampToken({ token, digest, algorithm: 'sha256', trust });
      expect(unknown).toMatchObject({ summary: 'valid-untrusted', trust: 'unknown' });
    }
  });

  test('another digest, or the same bytes under another algorithm, is invalid', async () => {
    const stamper = await createTestTimestampAuthority();
    const token = await stamper.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });

    const other = await verifyTimestampToken({
      token,
      digest: digest.map((byte) => byte ^ 1),
      algorithm: 'sha256',
    });
    expect(other).toMatchObject({ summary: 'invalid', cryptography: 'invalid' });
    const relabelled = await verifyTimestampToken({ token, digest, algorithm: 'sha384' });
    expect(relabelled).toMatchObject({ summary: 'invalid', cryptography: 'invalid' });
  });

  test('bytes that are no token are indeterminate, with nothing to show', async () => {
    const verdict = await verifyTimestampToken({
      token: new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x05]),
      digest,
      algorithm: 'sha256',
    });
    expect(verdict).toMatchObject({
      summary: 'indeterminate',
      cryptography: 'unsupported',
      genTime: null,
      authorityCertificate: null,
      trust: 'unknown',
    });
  });
});
