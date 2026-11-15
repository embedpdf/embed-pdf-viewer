import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, test } from 'vitest';

import { toArrayBuffer } from '../../src/cms/engine';
import { OID } from '../../src/cms/oids';
import { parseCmsInternal } from '../../src/cms/parse';
import { verifyCmsSignature } from '../../src/cms/verify';
import { buildDetachedCms, createTestSigner } from '../../src/index';
import { createIdentity, createTimestampAuthorityIdentity } from '../helpers/pki';
import { buildTestSignature, buildTestToken } from '../helpers/tokens';

const digest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);
const bytes = (value: Uint8Array) => Array.from(value);

/** `cms` with unsigned attributes added to its one signer. */
function withUnsignedAttributes(cms: Uint8Array, attributes: pkijs.Attribute[]): Uint8Array {
  const contentInfo = new pkijs.ContentInfo({
    schema: asn1js.fromBER(toArrayBuffer(cms)).result,
  });
  const signedData = new pkijs.SignedData({ schema: contentInfo.content });
  signedData.signerInfos[0]!.unsignedAttrs = new pkijs.SignedAndUnsignedAttributes({
    type: 1,
    attributes,
  });
  const out = new pkijs.ContentInfo({
    contentType: OID.signedData,
    content: signedData.toSchema(true),
  });
  return new Uint8Array(out.toSchema().toBER(false));
}

const asValue = (der: Uint8Array) => asn1js.fromBER(toArrayBuffer(der)).result;

describe('reading a CMS', () => {
  test('every timestamp token of every such attribute comes back, in order', async () => {
    const signer = await createTestSigner();
    const authority = await createTimestampAuthorityIdentity('authority');
    const tokens = await Promise.all(
      [1, 2, 3].map((seed) =>
        buildTestToken({ digest: new Uint8Array(32).fill(seed), authority: authority.signer }),
      ),
    );
    const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
    const stamped = withUnsignedAttributes(cms, [
      new pkijs.Attribute({
        type: OID.timestampToken,
        values: [asValue(tokens[0]!), asValue(tokens[1]!)],
      }),
      new pkijs.Attribute({ type: '1.2.3.4', values: [new asn1js.Null()] }),
      new pkijs.Attribute({ type: OID.timestampToken, values: [asValue(tokens[2]!)] }),
    ]);

    const internal = parseCmsInternal(stamped);
    expect(internal.timestampTokens.map(bytes)).toEqual(tokens.map(bytes));
    expect(bytes(internal.parsed.timestampToken!)).toEqual(bytes(tokens[0]!));
    // The signature itself is as it was.
    expect(await verifyCmsSignature(stamped)).toBe('valid');

    expect(parseCmsInternal(cms).timestampTokens).toEqual([]);
    expect(parseCmsInternal(cms).parsed.timestampToken).toBeNull();
  });

  test('both kinds of certificate binding are read, signing-certificate-v2 first', async () => {
    const signer = await createIdentity({ commonName: 'signer', ca: true });
    const sha384 = await buildTestSignature({
      digest,
      signer: signer.signer,
      binding: { version: 2, hashOid: OID.sha384 },
    });
    expect(parseCmsInternal(sha384).bindings).toMatchObject([{ version: 2, algorithm: 'sha384' }]);
    expect(parseCmsInternal(sha384).parsed.signingCertificateV2).toBe(true);

    const sha1 = await buildTestSignature({
      digest,
      signer: signer.signer,
      binding: { version: 1 },
    });
    const parsed = parseCmsInternal(sha1);
    expect(parsed.bindings).toMatchObject([{ version: 1, algorithm: 'sha1' }]);
    expect(parsed.bindings[0]!.certHash).toHaveLength(20);
    // CAdES asks for `signing-certificate-v2`: the SHA-1 attribute alone doesn't make a CMS one.
    expect(parsed.parsed.signingCertificateV2).toBe(false);

    const unknown = await buildTestSignature({
      digest,
      signer: signer.signer,
      binding: { version: 2, hashOid: '2.16.840.1.101.3.4.2.8' },
    });
    expect(parseCmsInternal(unknown).bindings).toMatchObject([{ version: 2, algorithm: null }]);
  });
});
