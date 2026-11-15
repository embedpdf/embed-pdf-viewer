import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, test } from 'vitest';

import { OID } from '../../src/cms/oids';
import { createTestSigner, createTestTimestampAuthority } from '../../src/index';
import { hasOpenSsl, opensslVerifiesToken } from '../helpers/openssl';

const digest = new Uint8Array(32).map((_, i) => (i * 11 + 5) & 0xff);

function certificateOf(der: Uint8Array): pkijs.Certificate {
  const copy = new Uint8Array(der.byteLength);
  copy.set(der);
  return pkijs.Certificate.fromBER(copy.buffer);
}

function extensionOf(certificate: pkijs.Certificate, oid: string): pkijs.Extension | undefined {
  return certificate.extensions?.find((extension) => extension.extnID === oid);
}

/** The key usage bits a certificate sets: the first byte of the extension's bit string. */
function keyUsageBits(certificate: pkijs.Certificate): number {
  const extension = extensionOf(certificate, OID.keyUsage)!;
  const bits = asn1js.fromBER(extension.extnValue.valueBlock.valueHexView).result;
  return new Uint8Array((bits as asn1js.BitString).valueBlock.valueHexView)[0]!;
}

describe('the test timestamp authority', () => {
  test('has a certificate whose only purpose is timestamping, in a critical extension', async () => {
    const authority = await createTestTimestampAuthority();
    const certificate = certificateOf(authority.certificate);

    const purposes = extensionOf(certificate, OID.extendedKeyUsage)!;
    expect(purposes.critical).toBe(true);
    expect((purposes.parsedValue as pkijs.ExtKeyUsage).keyPurposes).toEqual([OID.timeStamping]);

    // digitalSignature alone: an authority's certificate signs tokens, never certificates.
    expect(keyUsageBits(certificate)).toBe(0x80);
    const constraints = extensionOf(certificate, OID.basicConstraints)!;
    expect((constraints.parsedValue as pkijs.BasicConstraints).cA).toBe(false);
  });

  test("a test signer's certificate stays a signer's: no timestamping purpose", async () => {
    const signer = await createTestSigner();
    const certificate = certificateOf(signer.certificate);

    expect(extensionOf(certificate, OID.extendedKeyUsage)).toBeUndefined();
    expect(keyUsageBits(certificate)).toBe(0x84);
  });

  test.skipIf(!hasOpenSsl)('OpenSSL verifies its token against its certificate', async () => {
    const authority = await createTestTimestampAuthority();
    const token = await authority.sign({ digest, algorithm: 'sha256', subFilter: 'ETSI.RFC3161' });

    const verified = opensslVerifiesToken({ token, digest, anchor: authority.certificate });
    expect(verified.output).toContain('Verification: OK');

    // The same token over another digest, and against another authority's certificate.
    const otherDigest = digest.map((byte) => byte ^ 0xff);
    expect(
      opensslVerifiesToken({ token, digest: otherDigest, anchor: authority.certificate }).ok,
    ).toBe(false);
    const other = await createTestTimestampAuthority();
    expect(opensslVerifiesToken({ token, digest, anchor: other.certificate }).ok).toBe(false);
  });
});
