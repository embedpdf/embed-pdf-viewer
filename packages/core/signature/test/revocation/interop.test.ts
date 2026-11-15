/**
 * The checker and the test authority, each held to a program that shares none of their code.
 *
 * - Answers another program made, kept as files: certomancer's OCSP response and CRL, for
 *   certificates it issued through an intermediate authority and a delegated responder.
 * - OpenSSL as a certificate authority: its responder and its CRL, read by the checker.
 * - OpenSSL as a reader: the request this package sends, and what the test authority answers.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { certificateFromDer } from '../../src/cms/parse';
import { revocationAddresses } from '../../src/revocation/addresses';
import { checkRevocationAnswer } from '../../src/revocation/answer';
import { buildOcspRequest } from '../../src/revocation/request';
import { revocationStatusAt } from '../../src/revocation/status';
import { createTestCertificateAuthority } from '../../src/index';
import {
  createOpenSslCertificateAuthority,
  hasOpenSsl,
  opensslReadsCrl,
  opensslReadsOcspRequest,
  opensslReadsOcspResponse,
} from '../helpers/openssl';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/long-term');
const file = async (name: string) => new Uint8Array(await readFile(resolve(fixtures, name)));
const hex = (bytes: ArrayBufferView) =>
  Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('hex').toUpperCase();
/** A serial number as OpenSSL prints it: upper-case hex, no leading zero byte. */
const serialOf = (certificate: Uint8Array) =>
  hex(certificateFromDer(certificate).serialNumber.valueBlock.valueHexView).replace(/^(00)+/, '');

const check = (
  kind: 'ocsp' | 'crl',
  der: Uint8Array,
  certificate: Uint8Array,
  issuer: Uint8Array,
) =>
  checkRevocationAnswer({
    answer: { kind, der },
    certificate: certificateFromDer(certificate),
    issuer: certificateFromDer(issuer),
  });

describe('answers another program made (certomancer)', () => {
  /** When the signature these answers were fetched for was timestamped. */
  const SIGNED = new Date('2026-11-14T21:28:37Z');

  test('its OCSP response, signed by a responder the intermediate authority certified', async () => {
    const answer = await check(
      'ocsp',
      await file('signer.ocsp'),
      await file('signer.cer'),
      await file('intermediate.cer'),
    );
    expect(answer).toMatchObject({
      says: 'good',
      kind: 'ocsp',
      responder: await file('ocsp-responder.cer'),
    });
    // Its times carry fractions of a second: 21:29:30.019987, and ten minutes on.
    const window = answer.says === 'good' ? answer : null;
    expect(window?.thisUpdate.toISOString()).toMatch(/^2026-11-14T21:29:30\.0(19|20)Z$/);
    expect(window?.nextUpdate?.toISOString()).toMatch(/^2026-11-14T21:39:30\.0(19|20)Z$/);
    // Fetched a minute after the signature: it speaks for the signature, now and in ten years.
    expect(revocationStatusAt([answer], SIGNED).status).toBe('good');
    // For a moment a year on it says nothing.
    expect(revocationStatusAt([answer], new Date('2027-11-14T00:00:00Z')).status).toBe('unknown');
  });

  test('its CRL, for the certificates the root issued', async () => {
    const root = await file('root.cer');
    const list = await file('root.crl');
    for (const name of ['intermediate.cer', 'timestamp-authority.cer']) {
      const answer = await check('crl', list, await file(name), root);
      expect(answer, name).toMatchObject({
        says: 'good',
        kind: 'crl',
        nextUpdate: new Date('2026-11-25T00:00:00Z'),
        responder: null,
      });
      expect(revocationStatusAt([answer], SIGNED).status, name).toBe('good');
    }
  });

  test('neither says anything about a certificate it is not about', async () => {
    // The root's list, asked about a certificate the intermediate issued.
    expect(
      await check(
        'crl',
        await file('root.crl'),
        await file('signer.cer'),
        await file('intermediate.cer'),
      ),
    ).toMatchObject({ says: 'nothing', problem: 'other-certificate' });
    // The signer's answer, asked about the intermediate.
    expect(
      await check(
        'ocsp',
        await file('signer.ocsp'),
        await file('intermediate.cer'),
        await file('root.cer'),
      ),
    ).toMatchObject({ says: 'nothing', problem: 'other-certificate' });
    // The signer's answer, with the root offered as its issuer.
    expect(
      await check(
        'ocsp',
        await file('signer.ocsp'),
        await file('signer.cer'),
        await file('root.cer'),
      ),
    ).toMatchObject({ says: 'nothing', problem: 'other-certificate' });
  });

  test.skipIf(!hasOpenSsl)('OpenSSL reads the same answers the same way', async () => {
    const ocsp = opensslReadsOcspResponse({
      response: await file('signer.ocsp'),
      certificate: await file('signer.cer'),
      issuer: await file('intermediate.cer'),
      above: [await file('root.cer')],
    });
    expect(ocsp, ocsp.output).toMatchObject({ verified: true, status: 'good' });
    const crl = opensslReadsCrl({ crl: await file('root.crl'), issuer: await file('root.cer') });
    expect(crl, crl.output).toMatchObject({ verified: true, revoked: [] });
  });
});

describe.skipIf(!hasOpenSsl)('OpenSSL as the certificate authority', () => {
  let authority: ReturnType<typeof createOpenSslCertificateAuthority>;
  let kept: Uint8Array;
  let withdrawn: Uint8Array;

  beforeAll(() => {
    authority = createOpenSslCertificateAuthority();
    kept = authority.issue('Kept');
    withdrawn = authority.issue('Withdrawn');
  });
  afterAll(() => authority?.dispose());

  const request = (certificate: Uint8Array) =>
    buildOcspRequest(certificateFromDer(certificate), certificateFromDer(authority.certificate));

  test('its certificates name the addresses it was told to', () => {
    expect(revocationAddresses(certificateFromDer(kept))).toEqual({
      ocsp: ['http://openssl-authority.invalid/ocsp'],
      crl: ['http://openssl-authority.invalid/crl'],
      issuer: [],
    });
  });

  test('its responder understands the request, and the checker its answer', async () => {
    for (const responderId of ['name', 'key'] as const) {
      const answer = await check(
        'ocsp',
        authority.answer(await request(kept), responderId),
        kept,
        authority.certificate,
      );
      expect(answer, responderId).toMatchObject({ says: 'good', kind: 'ocsp' });
      // OpenSSL's responder is one the authority certified: its certificate comes back.
      expect(answer.says === 'good' && answer.responder, responderId).toBeInstanceOf(Uint8Array);
      expect(revocationStatusAt([answer], new Date()).status, responderId).toBe('good');
    }
  });

  test('its CRL, before and after a withdrawal, and its responder after', async () => {
    const before = authority.crl();
    expect(await check('crl', before, withdrawn, authority.certificate)).toMatchObject({
      says: 'good',
    });

    const start = Date.now();
    authority.revoke(withdrawn, 'keyCompromise');
    const after = authority.crl();
    for (const answer of [
      await check('crl', after, withdrawn, authority.certificate),
      await check(
        'ocsp',
        authority.answer(await request(withdrawn)),
        withdrawn,
        authority.certificate,
      ),
    ]) {
      expect(answer).toMatchObject({ says: 'revoked', reason: 'key-compromise' });
      const revokedAt = answer.says === 'revoked' ? answer.revokedAt.getTime() : 0;
      // Whole seconds, so up to a second before the call.
      expect(revokedAt).toBeGreaterThan(start - 2000);
      expect(revokedAt).toBeLessThanOrEqual(Date.now());
      expect(revocationStatusAt([answer], new Date()).status).toBe('revoked');
    }
    // The other certificate is untouched, in both.
    expect(await check('crl', after, kept, authority.certificate)).toMatchObject({ says: 'good' });
    expect(
      await check('ocsp', authority.answer(await request(kept)), kept, authority.certificate),
    ).toMatchObject({ says: 'good' });
    // The list from before the withdrawal still verifies, and still says what it said.
    expect(await check('crl', before, withdrawn, authority.certificate)).toMatchObject({
      says: 'good',
    });
  });

  test('an answer about one certificate is not an answer about the other', async () => {
    expect(
      await check('ocsp', authority.answer(await request(kept)), withdrawn, authority.certificate),
    ).toMatchObject({ says: 'nothing', problem: 'other-certificate' });
  });
});

describe.skipIf(!hasOpenSsl)('OpenSSL as the reader', () => {
  test('the request asks about the certificate it was built for', async () => {
    const der = await buildOcspRequest(
      certificateFromDer(await file('signer.cer')),
      certificateFromDer(await file('intermediate.cer')),
    );
    const read = opensslReadsOcspRequest(der);
    expect(read.serials, read.output).toEqual(['1001']);
    expect(read.output).toMatch(/Hash Algorithm: sha1/);
    expect(read.output).not.toMatch(/Nonce/);
  });

  test("the test authority's answers verify, and say what the checker reads in them", async () => {
    const authority = await createTestCertificateAuthority();
    const signer = await authority.issueSigner();
    const certificate = certificateFromDer(signer.certificate);
    const issuer = certificateFromDer(authority.certificate);
    const addresses = revocationAddresses(certificate);
    const ocsp = async () =>
      opensslReadsOcspResponse({
        response: await authority.revocation.fetch({
          kind: 'ocsp',
          url: addresses.ocsp[0]!,
          body: await buildOcspRequest(certificate, issuer),
        }),
        certificate: signer.certificate,
        issuer: authority.certificate,
      });
    const crl = async () =>
      opensslReadsCrl({
        crl: await authority.revocation.fetch({ kind: 'crl', url: addresses.crl[0]! }),
        issuer: authority.certificate,
      });

    let read = await ocsp();
    expect(read, read.output).toMatchObject({ verified: true, status: 'good' });
    let list = await crl();
    expect(list, list.output).toMatchObject({ verified: true, revoked: [] });

    authority.revoke(signer, { reason: 'key-compromise' });
    read = await ocsp();
    expect(read, read.output).toMatchObject({ verified: true, status: 'revoked' });
    expect(read.output).toMatch(/Reason: keyCompromise/);
    list = await crl();
    expect(list, list.output).toMatchObject({
      verified: true,
      revoked: [serialOf(signer.certificate)],
    });
    expect(list.output).toMatch(/Key Compromise/);
  });
});
