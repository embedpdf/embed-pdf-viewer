/**
 * The one verifier of revocation answers, against answers built here: every way an OCSP
 * response or a CRL can be about another certificate, signed by the wrong party, or outside
 * what this package reads. `interop.test.ts` holds it to answers other programs made.
 */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { beforeAll, describe, expect, test } from 'vitest';

import { toArrayBuffer } from '../../src/cms/engine';
import { OID } from '../../src/cms/oids';
import { certDer } from '../../src/cms/parse';
import { checkRevocationAnswer, type RevocationAnswerCheck } from '../../src/revocation/answer';
import {
  buildCrl,
  buildOcspResponse,
  issueCertificate,
  type AnswerStatus,
  type Issuer,
} from '../../src/signers/test-authority';
import { generateSigningKeyPair } from '../../src/index';
import { createAuthorityRoot } from '../helpers/pki';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const NOW = new Date('2026-11-15T12:00:00Z');
const after = (ms: number) => new Date(NOW.getTime() + ms);

/** A fresh key and a certificate for it. ECDSA, so a suite of them is quick to make. */
async function identity(
  kind: 'authority' | 'signer' | 'responder',
  commonName: string,
  issuer?: Issuer,
  validity: { notBefore?: Date; notAfter?: Date } = {},
): Promise<Issuer> {
  const keys = await generateSigningKeyPair('ECDSA', 'sha256', true);
  return {
    certificate: await issueCertificate({
      kind,
      commonName,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      issuer,
      notBefore: new Date('2026-01-01T00:00:00Z'),
      notAfter: new Date('2028-01-01T00:00:00Z'),
      ...validity,
    }),
    privateKey: keys.privateKey,
  };
}

let root: Issuer;
let responder: Issuer;
let signer: Issuer;
let other: Issuer;

beforeAll(async () => {
  root = await identity('authority', 'Root');
  responder = await identity('responder', 'Responder', root);
  signer = await identity('signer', 'Ada', root);
  other = await identity('signer', 'Grace', root);
});

const about = (
  answer: { kind: 'ocsp' | 'crl'; der: Uint8Array },
  certificate = signer.certificate,
  issuer = root.certificate,
): Promise<RevocationAnswerCheck> => checkRevocationAnswer({ answer, certificate, issuer });

describe('an OCSP response', () => {
  const ocsp = async (
    overrides: Partial<Parameters<typeof buildOcspResponse>[0]> & { status?: AnswerStatus } = {},
  ) => ({
    kind: 'ocsp' as const,
    der: await buildOcspResponse({
      certificate: signer.certificate,
      issuer: root.certificate,
      signer: responder,
      status: 'good',
      producedAt: NOW,
      thisUpdate: NOW,
      nextUpdate: after(HOUR),
      ...overrides,
    }),
  });

  test("good, signed by a responder the issuer certified: the responder's certificate comes back", async () => {
    expect(await about(await ocsp())).toEqual({
      says: 'good',
      kind: 'ocsp',
      thisUpdate: NOW,
      nextUpdate: after(HOUR),
      responder: certDer(responder.certificate),
    });
  });

  test('good, signed by the issuer itself', async () => {
    expect(await about(await ocsp({ signer: root }))).toMatchObject({
      says: 'good',
      responder: null,
    });
  });

  test('the responder may be named by its key, and the certificate identified with SHA-256', async () => {
    expect(await about(await ocsp({ responderId: 'key' }))).toMatchObject({ says: 'good' });
    expect(await about(await ocsp({ idHash: 'SHA-256' }))).toMatchObject({ says: 'good' });
  });

  test('an answer that names no end to its window', async () => {
    expect(await about(await ocsp({ nextUpdate: null }))).toMatchObject({
      says: 'good',
      nextUpdate: null,
    });
  });

  test('withdrawn, with the time and the reason the issuer gave', async () => {
    const revokedAt = new Date('2026-11-10T08:00:00Z');
    expect(
      await about(await ocsp({ status: { revokedAt, reason: 'key-compromise' } })),
    ).toMatchObject({ says: 'revoked', revokedAt, reason: 'key-compromise' });
    expect(await about(await ocsp({ status: { revokedAt } }))).toMatchObject({
      says: 'revoked',
      revokedAt,
      reason: null,
    });
  });

  test('a responder that does not know the certificate says nothing', async () => {
    expect(await about(await ocsp({ status: 'unknown' }))).toMatchObject({
      says: 'nothing',
      problem: 'unknown-status',
    });
  });

  test('an answer about another certificate says nothing about this one', async () => {
    expect(await about(await ocsp(), other.certificate)).toMatchObject({
      says: 'nothing',
      problem: 'other-certificate',
    });
  });

  test('a certificate the issuer given did not issue', async () => {
    const stranger = await identity('authority', 'Another root');
    expect(await about(await ocsp(), signer.certificate, stranger.certificate)).toMatchObject({
      says: 'nothing',
      problem: 'other-certificate',
    });
  });

  test.each([
    [
      'was issued by someone else',
      async () => identity('responder', 'Responder', await identity('authority', 'Another root')),
      /not issued by|not signed by/,
    ],
    [
      'is not made for answering',
      () => identity('signer', 'Not a responder', root),
      /not made for answering/,
    ],
    [
      'was outside its dates when it answered',
      () =>
        identity('responder', 'Lapsed responder', root, {
          notAfter: new Date('2026-06-01T00:00:00Z'),
        }),
      /outside its dates/,
    ],
  ])('a responder whose certificate %s is the wrong signer', async (_, make, detail) => {
    const check = await about(await ocsp({ signer: await make() }));
    expect(check).toMatchObject({ says: 'nothing', problem: 'wrong-signer' });
    expect((check as { detail: string }).detail).toMatch(detail);
  });

  test('a response whose signature does not verify', async () => {
    // Signed by the issuer, the response ends with its signature: no certificate follows it.
    const answer = await ocsp({ signer: root });
    answer.der[answer.der.length - 5]! ^= 0xff;
    expect(await about(answer)).toMatchObject({ says: 'nothing', problem: 'signature' });
    // What a response says is under the signature too: `good` ([0], empty) followed by the
    // time of `thisUpdate`, turned into `unknown` ([2]) and back.
    const changed = await ocsp({ status: 'unknown' });
    const status = changed.der.findIndex(
      (byte, index) =>
        byte === 0x82 &&
        changed.der[index + 1] === 0x00 &&
        changed.der[index + 2] === 0x18 &&
        changed.der[index + 3] === 0x0f,
    );
    expect(status).toBeGreaterThan(0);
    changed.der[status] = 0x80;
    expect(await about(changed)).toMatchObject({ says: 'nothing', problem: 'signature' });
  });

  test('a responder that answers with an error', async () => {
    const response = new pkijs.OCSPResponse();
    response.responseStatus.valueBlock.valueDec = 3;
    const check = await about({
      kind: 'ocsp',
      der: new Uint8Array(response.toSchema().toBER(false)),
    });
    expect(check).toMatchObject({ says: 'nothing', problem: 'not-successful' });
    expect((check as { detail: string }).detail).toMatch(/try later/);
  });

  test('bytes that are not an OCSP response', async () => {
    expect(await about({ kind: 'ocsp', der: new Uint8Array([1, 2, 3]) })).toMatchObject({
      says: 'nothing',
      problem: 'unreadable',
    });
    // A CRL handed over as an OCSP response is unreadable as one, not good.
    const crl = await buildCrl({ issuer: root, thisUpdate: NOW, revoked: [] });
    expect(await about({ kind: 'ocsp', der: crl })).toMatchObject({
      says: 'nothing',
      problem: 'unreadable',
    });
  });

  test('an RSA authority and responder', async () => {
    const keys = () => generateSigningKeyPair('RSA-PKCS1-v1_5', 'sha256', true);
    const rootKeys = await keys();
    const rsaRoot: Issuer = {
      certificate: await issueCertificate({
        kind: 'authority',
        commonName: 'RSA root',
        publicKey: rootKeys.publicKey,
        privateKey: rootKeys.privateKey,
      }),
      privateKey: rootKeys.privateKey,
    };
    const leafKeys = await keys();
    const leaf = await issueCertificate({
      kind: 'signer',
      commonName: 'RSA signer',
      publicKey: leafKeys.publicKey,
      issuer: rsaRoot,
    });
    const der = await buildOcspResponse({
      certificate: leaf,
      issuer: rsaRoot.certificate,
      signer: rsaRoot,
      status: 'good',
      producedAt: NOW,
      thisUpdate: NOW,
    });
    expect(await about({ kind: 'ocsp', der }, leaf, rsaRoot.certificate)).toMatchObject({
      says: 'good',
    });
  });
});

describe('a CRL', () => {
  const crl = async (overrides: Partial<Parameters<typeof buildCrl>[0]> = {}) => ({
    kind: 'crl' as const,
    der: await buildCrl({
      issuer: root,
      thisUpdate: NOW,
      nextUpdate: after(7 * DAY),
      revoked: [],
      ...overrides,
    }),
  });
  const extension = (extnID: string, value: asn1js.BaseBlock, critical = true) =>
    new pkijs.Extension({ extnID, critical, extnValue: value.toBER(false) });
  const scope = (parameters: ConstructorParameters<typeof pkijs.IssuingDistributionPoint>[0]) =>
    extension(
      OID.issuingDistributionPoint,
      new pkijs.IssuingDistributionPoint(parameters).toSchema(),
    );

  test('a certificate the list does not name is good, for the time the list speaks for', async () => {
    // A CRL's times carry whole seconds.
    expect(await about(await crl())).toEqual({
      says: 'good',
      kind: 'crl',
      thisUpdate: NOW,
      nextUpdate: after(7 * DAY),
      responder: null,
    });
  });

  test('a certificate the list names is withdrawn, at the time and for the reason listed', async () => {
    const at = new Date('2026-11-12T09:30:00Z');
    const list = await crl({
      revoked: [
        { serialNumber: other.certificate.serialNumber, at: new Date('2026-11-01T00:00:00Z') },
        { serialNumber: signer.certificate.serialNumber, at, reason: 'superseded' },
      ],
    });
    expect(await about(list)).toMatchObject({
      says: 'revoked',
      revokedAt: at,
      reason: 'superseded',
    });
    expect(await about(list, other.certificate)).toMatchObject({ says: 'revoked', reason: null });
  });

  test('a list from another issuer says nothing', async () => {
    const stranger = await identity('authority', 'Another root');
    expect(await about(await crl({ issuer: stranger }))).toMatchObject({
      says: 'nothing',
      problem: 'other-certificate',
    });
  });

  test('a list that holds only the changes since another one', async () => {
    const delta = extension(OID.deltaCrlIndicator, new asn1js.Integer({ value: 1 }));
    expect(await about(await crl({ extensions: [delta] }))).toMatchObject({
      says: 'nothing',
      problem: 'delta-crl',
    });
  });

  test('a list of other issuers certificates', async () => {
    expect(await about(await crl({ extensions: [scope({ indirectCRL: true })] }))).toMatchObject({
      says: 'nothing',
      problem: 'indirect-crl',
    });
  });

  test('a list that leaves out this kind of certificate, or some reasons', async () => {
    const authoritiesOnly = await crl({ extensions: [scope({ onlyContainsCACerts: true })] });
    expect(await about(authoritiesOnly)).toMatchObject({
      says: 'nothing',
      problem: 'out-of-scope',
    });
    // The same list does cover an authority's certificate.
    const intermediate = await identity('authority', 'Intermediate', root);
    expect(await about(authoritiesOnly, intermediate.certificate)).toMatchObject({ says: 'good' });
    const usersOnly = await crl({ extensions: [scope({ onlyContainsUserCerts: true })] });
    expect(await about(usersOnly)).toMatchObject({ says: 'good' });
    expect(await about(usersOnly, intermediate.certificate)).toMatchObject({
      says: 'nothing',
      problem: 'out-of-scope',
    });
    const someReasons = await crl({ extensions: [scope({ onlySomeReasons: 0x40 })] });
    expect(await about(someReasons)).toMatchObject({ says: 'nothing', problem: 'out-of-scope' });
  });

  test('a critical extension this package does not know', async () => {
    const unknown = extension('1.2.3.4.5', new asn1js.Null());
    expect(await about(await crl({ extensions: [unknown] }))).toMatchObject({
      says: 'nothing',
      problem: 'unsupported',
    });
    // The same extension, not critical, changes nothing.
    const harmless = extension('1.2.3.4.5', new asn1js.Null(), false);
    expect(await about(await crl({ extensions: [harmless] }))).toMatchObject({ says: 'good' });
  });

  test('an issuer whose certificate is not made for signing CRLs is the wrong signer', async () => {
    // The test helper's authority may sign certificates and nothing else.
    const plain = await createAuthorityRoot('Certificates only');
    const issuer: Issuer = {
      certificate: pkijs.Certificate.fromBER(toArrayBuffer(plain.certificate)),
      privateKey: plain.keys.privateKey,
    };
    const leaf = await identity('signer', 'Under it', issuer);
    const der = await buildCrl({ issuer, thisUpdate: NOW, revoked: [] });
    expect(await about({ kind: 'crl', der }, leaf.certificate, issuer.certificate)).toMatchObject({
      says: 'nothing',
      problem: 'wrong-signer',
    });
  });

  test('a list whose signature does not verify', async () => {
    const list = await crl();
    list.der[list.der.length - 5]! ^= 0xff;
    expect(await about(list)).toMatchObject({ says: 'nothing', problem: 'signature' });
  });
});
