/** The throwaway certificate authority: what it issues, and what it answers before and after a withdrawal. */
import { describe, expect, test } from 'vitest';

import { certificateFromDer } from '../../src/cms/parse';
import { revocationAddresses } from '../../src/revocation/addresses';
import { checkRevocationAnswer } from '../../src/revocation/answer';
import { buildOcspRequest } from '../../src/revocation/request';
import { revocationStatusAt } from '../../src/revocation/status';
import {
  createTestCertificateAuthority,
  createTestSigner,
  type TestCertificateAuthority,
} from '../../src/index';

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Ask the authority about a certificate, at the address the certificate names, and check the answer. */
async function ask(
  authority: TestCertificateAuthority,
  certificateDer: Uint8Array,
  kind: 'ocsp' | 'crl',
) {
  const certificate = certificateFromDer(certificateDer);
  const issuer = certificateFromDer(authority.certificate);
  const url = revocationAddresses(certificate)[kind][0]!;
  const der = await authority.revocation.fetch(
    kind === 'ocsp'
      ? { kind, url, body: await buildOcspRequest(certificate, issuer) }
      : { kind, url },
  );
  return checkRevocationAnswer({ answer: { kind, der }, certificate, issuer });
}

describe('createTestCertificateAuthority', () => {
  test('a signer whose chain leads to the authority and names where to ask about it', async () => {
    const authority = await createTestCertificateAuthority();
    const signer = await authority.issueSigner({ commonName: 'Ada' });
    const certificate = certificateFromDer(signer.certificate);
    const root = certificateFromDer(authority.certificate);

    expect(signer.certificateChain).toEqual([signer.certificate, authority.certificate]);
    expect(certificate.subject.typesAndValues[0]!.value.valueBlock.value).toBe('Ada');
    expect(certificate.issuer.isEqual(root.subject)).toBe(true);
    expect(await certificate.verify(root)).toBe(true);
    expect(revocationAddresses(certificate)).toEqual({
      ocsp: ['http://test-authority.example/ocsp'],
      crl: ['http://test-authority.example/crl'],
      issuer: ['http://test-authority.example/issuer'],
    });
    // The address of the issuer's certificate serves the authority's own.
    expect(
      await authority.revocation.fetch({
        kind: 'issuer',
        url: 'http://test-authority.example/issuer',
      }),
    ).toEqual(authority.certificate);
  });

  test('both of its answers say good, each for its own window', async () => {
    const now = new Date('2026-11-15T12:00:00Z');
    const authority = await createTestCertificateAuthority({ now: () => now });
    const signer = await authority.issueSigner();

    const ocsp = await ask(authority, signer.certificate, 'ocsp');
    expect(ocsp).toMatchObject({
      says: 'good',
      thisUpdate: now,
      nextUpdate: new Date(now.getTime() + HOUR),
    });
    // It answers through a responder it certified, as real authorities do.
    expect(ocsp.says === 'good' && ocsp.responder).toBeInstanceOf(Uint8Array);
    expect(await ask(authority, signer.certificate, 'crl')).toMatchObject({
      says: 'good',
      thisUpdate: now,
      nextUpdate: new Date(now.getTime() + 7 * DAY),
      responder: null,
    });
  });

  test('its certificates are dated by its clock, whatever day the test runs', async () => {
    // Years before and after today: an answer from the authority's time is checked against
    // the responder's certificate, which has to be from that time too.
    for (const at of ['2019-03-01T08:00:00Z', '2041-06-30T20:00:00Z']) {
      const now = new Date(at);
      const authority = await createTestCertificateAuthority({ now: () => now });
      const signer = await authority.issueSigner();
      for (const der of [authority.certificate, signer.certificate]) {
        const certificate = certificateFromDer(der);
        expect(certificate.notBefore.value, at).toEqual(new Date(now.getTime() - DAY));
        expect(certificate.notAfter.value, at).toEqual(new Date(now.getTime() + 365 * DAY));
      }
      for (const kind of ['ocsp', 'crl'] as const) {
        expect(await ask(authority, signer.certificate, kind), `${kind} at ${at}`).toMatchObject({
          says: 'good',
          thisUpdate: now,
        });
      }
    }
  });

  test('a withdrawn certificate: both answers say so, with the time and the reason', async () => {
    let now = new Date('2026-11-15T12:00:00Z');
    const authority = await createTestCertificateAuthority({ now: () => now });
    const signer = await authority.issueSigner();
    const other = await authority.issueSigner({ commonName: 'Grace' });
    const signed = now;

    now = new Date('2026-11-20T09:00:00Z');
    authority.revoke(signer, { reason: 'key-compromise' });
    for (const kind of ['ocsp', 'crl'] as const) {
      const answer = await ask(authority, signer.certificate, kind);
      expect(answer, kind).toMatchObject({
        says: 'revoked',
        revokedAt: now,
        reason: 'key-compromise',
      });
      // Withdrawn five days after the signature: the signature was made while it was good.
      expect(revocationStatusAt([answer], signed).status).toBe('good');
      expect(revocationStatusAt([answer], now).status).toBe('revoked');
      // A withdrawal touches that certificate only.
      expect(await ask(authority, other.certificate, kind), kind).toMatchObject({ says: 'good' });
    }

    // By its bytes, as of a time given, with no reason.
    authority.revoke(other.certificate, { at: new Date('2026-11-01T00:00:00Z') });
    expect(await ask(authority, other.certificate, 'crl')).toMatchObject({
      says: 'revoked',
      revokedAt: new Date('2026-11-01T00:00:00Z'),
      reason: null,
    });
  });

  test('what it did not issue, and where it does not answer', async () => {
    const authority = await createTestCertificateAuthority({ url: 'https://ca.test/' });
    const signer = await authority.issueSigner();
    expect(revocationAddresses(certificateFromDer(signer.certificate)).ocsp).toEqual([
      'https://ca.test/ocsp',
    ]);

    const stranger = await createTestSigner();
    expect(() => authority.revoke(stranger)).toThrow(/did not issue/);
    await expect(
      authority.revocation.fetch({ kind: 'crl', url: 'https://elsewhere.test/crl' }),
    ).rejects.toThrow(/does not answer at/);

    // A certificate of another authority, asked about here: the responder answers that it does
    // not know it, about the identifier it was asked with.
    const elsewhere = await createTestCertificateAuthority({ url: 'https://ca.test' });
    const foreign = certificateFromDer((await elsewhere.issueSigner()).certificate);
    const issuer = certificateFromDer(authority.certificate);
    const der = await authority.revocation.fetch({
      kind: 'ocsp',
      url: 'https://ca.test/ocsp',
      body: await buildOcspRequest(foreign, issuer),
    });
    expect(
      await checkRevocationAnswer({ answer: { kind: 'ocsp', der }, certificate: foreign, issuer }),
    ).toMatchObject({ says: 'nothing', problem: 'unknown-status' });
  });
});
