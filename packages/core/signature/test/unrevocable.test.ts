/**
 * Certificates that can't be withdrawn. A signing service that issues a certificate for one
 * signature, valid for minutes, runs no revocation service for it, and the certificate says
 * so in an extension: ETSI's "validity assured, short term" (its standard 319 412-1) or
 * `noRevAvail` (RFC 9608). For those, no answer is not a gap: nothing is asked about them,
 * and a signature made with one reads good and can be checked for years without any.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { createLocalEngine } from '@embedpdf/engine';
import type { DocumentHandle, Engine } from '@embedpdf/engine-core/runtime';

import { certDer } from '../src/cms/parse';
import { cannotBeRevoked } from '../src/revocation/addresses';
import { pathRevocation, ValidationPool } from '../src/revocation/pool';
import { issueCertificate, type Issuer } from '../src/signers/test-authority';
import {
  addValidationInfo,
  createTestCertificateAuthority,
  createTestTimestampAuthority,
  generateSigningKeyPair,
  sign,
  validateSignatures,
  type RevocationSource,
  type Unrevocable,
} from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = resolve(here, '..', '..', '..', 'engine', 'main', 'test', 'fixtures');
const field = { kind: 'fqn', name: 'sig' } as const;
const BOTH: readonly Unrevocable[] = ['validity-assured', 'no-rev-avail'];
const ASK = { ocsp: 'http://issuer.invalid/ocsp', crl: 'http://issuer.invalid/crl' };

/** A root, an authority under it, and what that authority issues. */
async function chain() {
  const keys = () => generateSigningKeyPair('ECDSA', 'sha256', true);
  const rootKeys = await keys();
  const root: Issuer = {
    certificate: await issueCertificate({
      kind: 'authority',
      commonName: 'Root',
      publicKey: rootKeys.publicKey,
      privateKey: rootKeys.privateKey,
    }),
    privateKey: rootKeys.privateKey,
  };
  const middleKeys = await keys();
  const middle: Issuer = {
    certificate: await issueCertificate({
      kind: 'authority',
      commonName: 'Issuing authority',
      publicKey: middleKeys.publicKey,
      issuer: root,
      addresses: ASK,
    }),
    privateKey: middleKeys.privateKey,
  };
  const issue = async (
    options: Partial<Parameters<typeof issueCertificate>[0]> = {},
    issuer: Issuer = middle,
  ) =>
    issueCertificate({
      kind: 'signer',
      commonName: 'Signer',
      publicKey: (await keys()).publicKey,
      issuer,
      ...options,
    });
  return { root, middle, issue };
}

describe('a certificate that says it cannot be withdrawn', () => {
  test('either extension counts, on a certificate that issues nothing', async () => {
    const { issue } = await chain();
    expect(cannotBeRevoked(await issue({ addresses: ASK }))).toBe(false);
    for (const unrevocable of BOTH) {
      expect(cannotBeRevoked(await issue({ unrevocable })), unrevocable).toBe(true);
      // An authority speaks for what it issues: it is asked about as ever.
      expect(
        cannotBeRevoked(await issue({ kind: 'authority', unrevocable })),
        `${unrevocable} on an authority`,
      ).toBe(false);
    }
  });

  test('noRevAvail beside an address to ask at contradicts itself, and does not count', async () => {
    const { issue } = await chain();
    for (const addresses of [{ ocsp: ASK.ocsp }, { crl: ASK.crl }, ASK]) {
      expect(cannotBeRevoked(await issue({ unrevocable: 'no-rev-avail', addresses }))).toBe(false);
    }
    // Where its issuer's certificate is, is not an address to ask about it.
    expect(
      cannotBeRevoked(
        await issue({
          unrevocable: 'no-rev-avail',
          addresses: { issuer: 'http://issuer.invalid' },
        }),
      ),
    ).toBe(true);
    // ETSI's extension makes no such rule: the issuer vouches for the certificate's short life.
    expect(cannotBeRevoked(await issue({ unrevocable: 'validity-assured', addresses: ASK }))).toBe(
      true,
    );
  });

  test('it has no row in its path, and the certificates above it still have theirs', async () => {
    const { root, middle, issue } = await chain();
    const pathOf = async (signer: Awaited<ReturnType<typeof issue>>) =>
      (
        await pathRevocation(
          new ValidationPool(),
          [certDer(signer), certDer(middle.certificate), certDer(root.certificate)],
          new Date(),
        )
      ).map((row) => [row.name, row.status]);

    expect(await pathOf(await issue({ addresses: ASK }))).toEqual([
      ['Signer', 'unknown'],
      ['Issuing authority', 'unknown'],
    ]);
    for (const unrevocable of BOTH) {
      expect(await pathOf(await issue({ unrevocable })), unrevocable).toEqual([
        ['Issuing authority', 'unknown'],
      ]);
    }
  });
});

describe('a signature made with one', () => {
  let engine: Engine;
  let bytes: Uint8Array;
  let opened = 0;

  beforeAll(async () => {
    engine = createLocalEngine({ runtime: { prefer: 'wasm' } });
    bytes = new Uint8Array(await readFile(resolve(fixtures, 'unsigned_sigfield.pdf')));
  });
  afterAll(async () => {
    await engine.destroy();
  });

  async function withDocument<T>(body: (doc: DocumentHandle) => Promise<T>): Promise<T> {
    const doc = await engine.open({ kind: 'bytes', id: `unrevocable-${opened++}`, bytes });
    try {
      return await body(doc);
    } finally {
      await doc.close();
    }
  }

  for (const unrevocable of BOTH) {
    test(`${unrevocable}: it reads good and enabled with no answer in the file, and nobody is asked`, async () => {
      const ca = await createTestCertificateAuthority();
      const signer = await ca.issueSigner({ commonName: 'One signature', unrevocable });
      const timestampAuthority = await createTestTimestampAuthority();
      const trust = {
        anchors: async () => [ca.certificate],
        timestampAnchors: async () => [timestampAuthority.certificate],
      };
      const asked: string[] = [];
      const revocation: RevocationSource = {
        fetch: async (request) => {
          asked.push(`${request.kind} ${request.url}`);
          return ca.revocation.fetch(request);
        },
      };

      await withDocument(async (doc) => {
        await sign(doc, { field, key: signer, timestampAuthority });
        // The file holds no answer about anything, and none is missing.
        expect(await doc.signatures.getValidationInfo()).toEqual({
          certificates: [],
          ocspResponses: [],
          crls: [],
        });
        const [verdict] = await validateSignatures(doc, { trust });
        expect(verdict).toMatchObject({
          summary: 'valid',
          revocation: 'good',
          longTerm: { enabled: true, missing: [] },
        });
        // Judged now, with a source to ask: still nothing to ask about.
        const [now] = await validateSignatures(doc, {
          trust,
          revocation,
          validationTime: { kind: 'now' },
        });
        expect(now).toMatchObject({ summary: 'valid', revocation: 'good' });

        // Collecting stores the certificates a reader follows, and no answer.
        const result = await addValidationInfo(doc, { trust, revocation });
        expect(result.added).toMatchObject({ ocspResponses: 0, crls: 0 });
        expect(result.verdicts[0]!.longTerm.enabled).toBe(true);
        expect(asked).toEqual([]);
      });
    });
  }

  test('the same authority still needs an answer for a certificate that can be withdrawn', async () => {
    const ca = await createTestCertificateAuthority();
    const signer = await ca.issueSigner({ commonName: 'Long lived' });
    const timestampAuthority = await createTestTimestampAuthority();
    const trust = {
      anchors: async () => [ca.certificate],
      timestampAnchors: async () => [timestampAuthority.certificate],
    };
    await withDocument(async (doc) => {
      await sign(doc, { field, key: signer, timestampAuthority });
      const [verdict] = await validateSignatures(doc, { trust });
      expect(verdict).toMatchObject({
        summary: 'valid',
        revocation: 'unknown',
        longTerm: { enabled: false, missing: [{ certificate: 'Long lived', reason: 'no-answer' }] },
      });
    });
  });

  test('the test authority does not withdraw a certificate it issued as one that cannot be', async () => {
    const ca = await createTestCertificateAuthority();
    const signer = await ca.issueSigner({ unrevocable: 'validity-assured' });
    expect(() => ca.revoke(signer)).toThrow(/cannot be withdrawn/);
  });
});
