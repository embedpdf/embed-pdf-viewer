/**
 * Checking a signature reaches nothing outside the runtime. The signer's certificate names where
 * its issuer, its revocation list and its OCSP responder live (Authority Information Access and
 * CRL Distribution Points, RFC 5280 §4.2.2.1 and §4.2.1.13), as a real CA's certificate does; the
 * chain is judged against the anchors the app gives and the certificates the signature carries,
 * so a missing intermediate makes the signer untrusted instead of a request to the address the
 * PDF carries.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createLocalEngine } from '@embedpdf/engine';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from 'vitest';

import { generateSigningKeyPair, sign, validateSignatures, webCryptoSigner } from '../src/index';

const here = dirname(fileURLToPath(import.meta.url));

const OID = {
  commonName: '2.5.4.3',
  basicConstraints: '2.5.29.19',
  keyUsage: '2.5.29.15',
  authorityInfoAccess: '1.3.6.1.5.5.7.1.1',
  caIssuers: '1.3.6.1.5.5.7.48.2',
  ocsp: '1.3.6.1.5.5.7.48.1',
  crlDistributionPoints: '2.5.29.31',
} as const;

const ISSUER_URL = 'http://issuer.example.test/ca.cer';
const OCSP_URL = 'http://ocsp.example.test/';
const CRL_URL = 'http://crl.example.test/ca.crl';

const nameOf = (commonName: string) => {
  const name = new pkijs.RelativeDistinguishedNames();
  name.typesAndValues.push(
    new pkijs.AttributeTypeAndValue({
      type: OID.commonName,
      value: new asn1js.Utf8String({ value: commonName }),
    }),
  );
  return name;
};

const uri = (url: string) => new pkijs.GeneralName({ type: 6, value: url });

/** A certificate for `subject`, signed by `issuer`'s key; a CA, or a leaf that names where to fetch more. */
async function certificate(input: {
  subject: string;
  issuer: string;
  publicKey: CryptoKey;
  signingKey: CryptoKey;
  serial: number;
  ca: boolean;
}): Promise<Uint8Array> {
  const cert = new pkijs.Certificate();
  cert.version = 2;
  cert.serialNumber = new asn1js.Integer({ value: input.serial });
  cert.subject = nameOf(input.subject);
  cert.issuer = nameOf(input.issuer);
  const now = Date.now();
  cert.notBefore.value = new Date(now - 24 * 3600 * 1000);
  cert.notAfter.value = new Date(now + 30 * 24 * 3600 * 1000);
  const basicConstraints = new pkijs.BasicConstraints({ cA: input.ca });
  // A CA signs certificates (keyCertSign, bit 5); a leaf signs documents (digitalSignature, bit 0).
  const keyUsage = new asn1js.BitString({
    valueHex: new Uint8Array([input.ca ? 0x04 : 0x80]).buffer,
    unusedBits: input.ca ? 2 : 7,
  });
  cert.extensions = [
    new pkijs.Extension({
      extnID: OID.basicConstraints,
      critical: true,
      extnValue: basicConstraints.toSchema().toBER(false),
      parsedValue: basicConstraints,
    }),
    new pkijs.Extension({ extnID: OID.keyUsage, critical: true, extnValue: keyUsage.toBER(false) }),
  ];
  if (!input.ca) {
    const access = new pkijs.InfoAccess({
      accessDescriptions: [
        new pkijs.AccessDescription({
          accessMethod: OID.caIssuers,
          accessLocation: uri(ISSUER_URL),
        }),
        new pkijs.AccessDescription({ accessMethod: OID.ocsp, accessLocation: uri(OCSP_URL) }),
      ],
    });
    const points = new pkijs.CRLDistributionPoints({
      distributionPoints: [new pkijs.DistributionPoint({ distributionPoint: [uri(CRL_URL)] })],
    });
    cert.extensions.push(
      new pkijs.Extension({
        extnID: OID.authorityInfoAccess,
        extnValue: access.toSchema().toBER(false),
      }),
      new pkijs.Extension({
        extnID: OID.crlDistributionPoints,
        extnValue: points.toSchema().toBER(false),
      }),
    );
  }
  await cert.subjectPublicKeyInfo.importKey(input.publicKey);
  await cert.sign(input.signingKey, 'SHA-256');
  return new Uint8Array(cert.toSchema(true).toBER(false));
}

type Engine = Awaited<ReturnType<typeof createLocalEngine>>;
let engine: Engine;
let base: Uint8Array;
let rootCertificate: Uint8Array;
let intermediateCertificate: Uint8Array;
let leafCertificate: Uint8Array;
let leafKey: CryptoKey;

beforeAll(async () => {
  engine = await createLocalEngine();
  base = new Uint8Array(
    await readFile(resolve(here, '../../../engine/main/test/fixtures/unsigned_sigfield.pdf')),
  );
  const root = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
  const intermediate = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
  const leaf = await generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
  rootCertificate = await certificate({
    subject: 'Offline Test Root',
    issuer: 'Offline Test Root',
    publicKey: root.publicKey,
    signingKey: root.privateKey,
    serial: 1,
    ca: true,
  });
  intermediateCertificate = await certificate({
    subject: 'Offline Test Intermediate',
    issuer: 'Offline Test Root',
    publicKey: intermediate.publicKey,
    signingKey: root.privateKey,
    serial: 2,
    ca: true,
  });
  leafCertificate = await certificate({
    subject: 'Offline Test Signer',
    issuer: 'Offline Test Intermediate',
    publicKey: leaf.publicKey,
    signingKey: intermediate.privateKey,
    serial: 3,
    ca: false,
  });
  leafKey = leaf.privateKey;
});

afterAll(async () => {
  await engine.destroy();
});

afterEach(() => vi.unstubAllGlobals());

/** Every request the runtime tries while `run` runs: `fetch`, `XMLHttpRequest` and `WebSocket`. */
async function requestsDuring(run: () => Promise<void>): Promise<string[]> {
  const requests: string[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      requests.push(String(input));
      throw new Error('no network in this test');
    }),
  );
  vi.stubGlobal(
    'XMLHttpRequest',
    class {
      open(_method: string, url: string) {
        requests.push(url);
      }
      send() {
        throw new Error('no network in this test');
      }
    },
  );
  vi.stubGlobal(
    'WebSocket',
    class {
      constructor(url: string) {
        requests.push(url);
        throw new Error('no network in this test');
      }
    },
  );
  await run();
  return requests;
}

/** A document signed by the leaf, carrying `chain` as its certificates. */
async function signedWith(chain: Uint8Array[], id: string) {
  const doc = await engine.open({ kind: 'bytes', id, bytes: base }, { scope: ['*'] });
  const key = webCryptoSigner({ privateKey: leafKey, certificateChain: chain });
  await sign(doc, { field: { kind: 'fqn', name: 'sig' }, key });
  return doc;
}

describe('checking a signature', () => {
  test('never fetches the issuer, a revocation list or an OCSP answer the certificate names', async () => {
    // The intermediate isn't in the signature: a validator that fetched would try the address
    // the certificate's Authority Information Access names.
    const doc = await signedWith([leafCertificate], 'offline-missing-issuer');
    try {
      let summary: string | undefined;
      let trust: string | undefined;
      const requests = await requestsDuring(async () => {
        const [verdict] = await validateSignatures(doc, {
          trust: { anchors: async () => [rootCertificate] },
        });
        summary = verdict!.summary;
        trust = verdict!.trust;
      });
      expect(requests).toEqual([]);
      // Judged on what it has: the signature holds, the signer can't be traced to an anchor.
      expect(trust).toBe('untrusted');
      expect(summary).toBe('valid-untrusted');
    } finally {
      await doc.close();
    }
  });

  test('trusts a full chain to an anchor without asking anyone about revocation', async () => {
    const doc = await signedWith([leafCertificate, intermediateCertificate], 'offline-full-chain');
    try {
      let trust: string | undefined;
      const requests = await requestsDuring(async () => {
        const [verdict] = await validateSignatures(doc, {
          trust: { anchors: async () => [rootCertificate] },
        });
        trust = verdict!.trust;
      });
      expect(requests).toEqual([]);
      expect(trust).toBe('trusted');
    } finally {
      await doc.close();
    }
  });
});
