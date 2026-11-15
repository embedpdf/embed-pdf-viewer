/** The addresses a certificate names for asking about it, and the request that asks. */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, test } from 'vitest';

import { toArrayBuffer } from '../../src/cms/engine';
import { certificateFromDer } from '../../src/cms/parse';
import { revocationAddresses } from '../../src/revocation/addresses';
import { buildOcspRequest } from '../../src/revocation/request';
import { issueCertificate } from '../../src/signers/test-authority';
import { generateSigningKeyPair } from '../../src/index';

const fixtures = resolve(dirname(fileURLToPath(import.meta.url)), '../fixtures/long-term');
const fixture = async (name: string) =>
  certificateFromDer(new Uint8Array(await readFile(resolve(fixtures, name))));

async function withAddresses(addresses: { ocsp?: string; crl?: string; issuer?: string }) {
  const keys = await generateSigningKeyPair('ECDSA', 'sha256', true);
  return issueCertificate({
    kind: 'signer',
    commonName: 'Ada',
    publicKey: keys.publicKey,
    privateKey: keys.privateKey,
    addresses,
  });
}

describe('revocationAddresses', () => {
  test('a certificate another program issued', async () => {
    expect(revocationAddresses(await fixture('signer.cer'))).toEqual({
      ocsp: ['http://localhost:9413/ltv/ocsp/interm'],
      crl: ['http://localhost:9413/ltv/crls/interm/latest.crl'],
      issuer: [],
    });
    // The responder's own certificate says not to ask about it, and names nowhere to ask.
    expect(revocationAddresses(await fixture('ocsp-responder.cer'))).toEqual({
      ocsp: [],
      crl: [],
      issuer: [],
    });
  });

  test('each kind of address, and a certificate that names none', async () => {
    const addresses = {
      ocsp: 'http://authority.test/ocsp',
      crl: 'https://authority.test/list.crl',
      issuer: 'http://authority.test/issuer.cer',
    };
    expect(revocationAddresses(await withAddresses(addresses))).toEqual({
      ocsp: [addresses.ocsp],
      crl: [addresses.crl],
      issuer: [addresses.issuer],
    });
    expect(revocationAddresses(await withAddresses({ crl: addresses.crl }))).toEqual({
      ocsp: [],
      crl: [addresses.crl],
      issuer: [],
    });
    expect(revocationAddresses(await withAddresses({}))).toEqual({ ocsp: [], crl: [], issuer: [] });
  });

  test('only addresses a web page or a route can ask come back', async () => {
    const certificate = await withAddresses({
      ocsp: 'ldap://directory.test/cn=responder',
      crl: 'ldap://directory.test/cn=list?certificateRevocationList',
      issuer: 'ftp://authority.test/issuer.cer',
    });
    expect(revocationAddresses(certificate)).toEqual({ ocsp: [], crl: [], issuer: [] });
  });
});

describe('buildOcspRequest', () => {
  test('asks about the certificate by its serial number and its issuer, with SHA-1', async () => {
    const certificate = await fixture('signer.cer');
    const issuer = await fixture('intermediate.cer');
    const der = await buildOcspRequest(certificate, issuer);
    const request = new pkijs.OCSPRequest({ schema: asn1js.fromBER(toArrayBuffer(der)).result });
    expect(request.tbsRequest.requestList).toHaveLength(1);
    const asked = request.tbsRequest.requestList[0]!.reqCert;
    expect(asked.hashAlgorithm.algorithmId).toBe('1.3.14.3.2.26');
    expect(asked.serialNumber.valueBlock.valueHexView).toEqual(
      certificate.serialNumber.valueBlock.valueHexView,
    );
    const expected = new pkijs.CertID();
    await expected.createForCertificate(certificate, {
      hashAlgorithm: 'SHA-1',
      issuerCertificate: issuer,
    });
    expect(asked.isEqual(expected)).toBe(true);
  });

  test('the same question always has the same bytes: it carries no nonce', async () => {
    const certificate = await fixture('signer.cer');
    const issuer = await fixture('intermediate.cer');
    const first = await buildOcspRequest(certificate, issuer);
    expect(await buildOcspRequest(certificate, issuer)).toEqual(first);
    const request = new pkijs.OCSPRequest({ schema: asn1js.fromBER(toArrayBuffer(first)).result });
    expect(request.tbsRequest.requestExtensions).toBeUndefined();
  });
});
