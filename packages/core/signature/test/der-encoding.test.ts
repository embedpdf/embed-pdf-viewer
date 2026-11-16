/**
 * What this package writes in ASN.1 is DER, not only something PKI.js and OpenSSL read back.
 * PAdES asks for DER in a signature's `/Contents`, and a strict reader refuses anything else:
 * pyHanko could not read the test timestamp authority's token while its content was an octet
 * string made of parts.
 */
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { attachSignatureTimestamp } from '../src/cms/attach';
import { buildDetachedCms } from '../src/cms/build';
import { randomPositiveInteger, toArrayBuffer } from '../src/cms/engine';
import { OID } from '../src/cms/oids';
import { certificateFromDer, readCmsParts } from '../src/cms/parse';
import {
  createTestCertificateAuthority,
  createTestSigner,
  createTestTimestampAuthority,
} from '../src/index';
import { buildOcspRequest } from '../src/revocation/request';
import { derProblem, signedAttributesAsSet } from './helpers/der';

const digest = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);
const AUTHORITY = 'http://test-authority.example';

describe('the strict reader these tests use', () => {
  const problemOf = (...bytes: number[]) => derProblem(new Uint8Array(bytes));

  test('takes DER', () => {
    // sequence { integer 1, boolean true, octet string 61, set { integer 1, integer 2 } }
    expect(
      problemOf(
        ...[0x30, 0x11, 0x02, 0x01, 0x01, 0x01, 0x01, 0xff, 0x04, 0x01, 0x61],
        ...[0x31, 0x06, 0x02, 0x01, 0x01, 0x02, 0x01, 0x02],
      ),
    ).toBeNull();
  });

  test('says what is not DER', () => {
    // An octet string made of parts, the way PKI.js wraps a CMS's content.
    expect(problemOf(0x24, 0x03, 0x04, 0x01, 0x61)).toMatch(/type 4 built of parts/);
    expect(problemOf(0x30, 0x80, 0x02, 0x01, 0x01, 0x00, 0x00)).toMatch(/indefinite length/);
    expect(problemOf(0x04, 0x81, 0x01, 0x61)).toMatch(/short length in the long form/);
    expect(problemOf(0x01, 0x01, 0x01)).toMatch(/boolean/);
    expect(problemOf(0x02, 0x02, 0x00, 0x01)).toMatch(/spare leading byte/);
    expect(problemOf(0x31, 0x06, 0x02, 0x01, 0x02, 0x02, 0x01, 0x01)).toMatch(/out of order/);
    expect(problemOf(0x04, 0x01, 0x61, 0x00)).toMatch(/1 bytes after the value/);
    expect(problemOf(0x04, 0x02, 0x61)).toMatch(/past the end/);
  });

  test('refuses what PKI.js makes of a content handed to its constructor', () => {
    const content = new pkijs.EncapsulatedContentInfo({
      eContentType: OID.tstInfo,
      eContent: new asn1js.OctetString({ valueHex: new Uint8Array([0x30, 0x00]).buffer }),
    });
    expect(derProblem(new Uint8Array(content.toSchema().toBER(false)))).toMatch(
      /type 4 built of parts/,
    );
  });
});

describe('what the package writes is DER', () => {
  test("the test timestamp authority's token, its content and its certificate", async () => {
    const authority = await createTestTimestampAuthority();
    const token = await authority.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });

    expect(derProblem(token)).toBeNull();
    expect(derProblem(signedAttributesAsSet(token))).toBeNull();
    expect(derProblem(readCmsParts(token, 'tst-info').eContent!)).toBeNull();
    expect(derProblem(authority.certificate)).toBeNull();
  });

  test('a self-signed test certificate', async () => {
    expect(derProblem((await createTestSigner()).certificate)).toBeNull();
  });

  for (const algorithm of ['RSA-PKCS1-v1_5', 'RSA-PSS', 'ECDSA'] as const) {
    test(`${algorithm}: certificates, signatures with and without a timestamp, and OCSP`, async () => {
      const ca = await createTestCertificateAuthority({ url: AUTHORITY });
      const signer = await ca.issueSigner({ algorithm });
      const timestampAuthority = await createTestTimestampAuthority();
      for (const der of signer.certificateChain) expect(derProblem(der)).toBeNull();

      for (const profile of ['cades-b', 'pkcs7'] as const) {
        const cms = await buildDetachedCms({
          digest,
          hash: 'sha256',
          profile,
          signer,
          ...(profile === 'pkcs7' ? { signingTime: '2026-11-15T10:00:00Z' } : {}),
        });
        expect(derProblem(cms), profile).toBeNull();
        // The signing time of a PKCS#7 signature sorts before its message digest.
        expect(derProblem(signedAttributesAsSet(cms)), `${profile}: signed attributes`).toBeNull();
        const stamped = await attachSignatureTimestamp({ cms, authority: timestampAuthority });
        expect(derProblem(stamped), `${profile} with a timestamp`).toBeNull();
        expect(signedAttributesAsSet(stamped)).toEqual(signedAttributesAsSet(cms));
      }

      const request = await buildOcspRequest(
        certificateFromDer(signer.certificateChain[0]!),
        certificateFromDer(signer.certificateChain[1]!),
      );
      expect(derProblem(request)).toBeNull();
      const answer = await ca.revocation.fetch({
        kind: 'ocsp',
        url: `${AUTHORITY}/ocsp`,
        body: request,
      });
      expect(derProblem(answer)).toBeNull();
    });
  }

  test('a list of withdrawn certificates, empty and with entries', async () => {
    const ca = await createTestCertificateAuthority({ url: AUTHORITY });
    const list = () => ca.revocation.fetch({ kind: 'crl', url: `${AUTHORITY}/crl` });

    expect(derProblem(await list())).toBeNull();
    ca.revoke(await ca.issueSigner());
    ca.revoke(await ca.issueSigner());
    expect(derProblem(await list())).toBeNull();
  });
});

describe('a serial number, whatever the random octets are', () => {
  // Eight random octets with only the top bit cleared start with a zero octet about once in
  // 256. Written as they are, that integer has an octet DER leaves out, and OpenSSL refuses the
  // certificate or the token it is in.
  const randomOctetsAre = (octet: number) =>
    vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation((array) => {
      (array as Uint8Array).fill(octet);
      return array;
    });
  afterEach(() => vi.restoreAllMocks());

  test('the octets are a positive DER integer', () => {
    for (const octet of [0x00, 0x3f, 0x80, 0xff]) {
      randomOctetsAre(octet);
      const octets = randomPositiveInteger();
      expect(octets[0], `from ${octet}`).toBeGreaterThanOrEqual(0x40);
      expect(octets[0], `from ${octet}`).toBeLessThanOrEqual(0x7f);
      const integer = new asn1js.Integer({ valueHex: toArrayBuffer(octets) });
      expect(derProblem(new Uint8Array(integer.toBER(false))), `from ${octet}`).toBeNull();
      vi.restoreAllMocks();
    }
  });

  test('a self-signed certificate, an issued one and a timestamp token are DER', async () => {
    randomOctetsAre(0x00);
    expect(derProblem((await createTestSigner()).certificate)).toBeNull();

    const ca = await createTestCertificateAuthority({ url: AUTHORITY });
    for (const der of (await ca.issueSigner()).certificateChain) {
      expect(derProblem(der)).toBeNull();
    }

    const authority = await createTestTimestampAuthority();
    expect(derProblem(authority.certificate)).toBeNull();
    const token = await authority.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });
    expect(derProblem(token)).toBeNull();
    expect(derProblem(readCmsParts(token, 'tst-info').eContent!)).toBeNull();
  });
});
