import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, test } from 'vitest';

import { toArrayBuffer } from '../../src/cms/engine';
import { OID } from '../../src/cms/oids';
import { CmsError, parseCmsInternal } from '../../src/cms/parse';
import { addUnsignedAttribute, childrenOf, encodeElement, readElement } from '../../src/cms/splice';
import { verifyCmsSignature } from '../../src/cms/verify';
import { buildDetachedCms, createTestSigner } from '../../src/index';
import { createOpenSslSigner, hasOpenSsl } from '../helpers/openssl';

const content = new TextEncoder().encode('what the other library signed');
const digest = new Uint8Array(32).map((_, i) => (i * 7 + 3) & 0xff);

/** An attribute of a private type with one value, as DER. */
function attribute(type: string, value: Uint8Array): Uint8Array {
  return new Uint8Array(
    new pkijs.Attribute({
      type,
      values: [new asn1js.OctetString({ valueHex: toArrayBuffer(value) })],
    })
      .toSchema()
      .toBER(false),
  );
}

/** Where `needle` first occurs in `haystack` at or after `from`, or -1. */
function indexOfBytes(haystack: Uint8Array, needle: Uint8Array, from = 0): number {
  outer: for (let at = from; at <= haystack.length - needle.length; at++) {
    for (let i = 0; i < needle.length; i++) {
      if (haystack[at + i] !== needle[i]) continue outer;
    }
    return at;
  }
  return -1;
}

/** The members of a CMS's SignedData, and of its signer, as the bytes they were written in. */
function membersOf(cms: Uint8Array): Uint8Array[] {
  const contentInfo = readElement(cms, 0, cms.byteLength);
  const [, wrapped] = childrenOf(cms, contentInfo);
  const signedData = childrenOf(cms, wrapped!)[0]!;
  const dataMembers = childrenOf(cms, signedData);
  const signerInfo = childrenOf(cms, dataMembers.at(-1)!)[0]!;
  return [...dataMembers.slice(0, -1), ...childrenOf(cms, signerInfo)].map((member) =>
    cms.slice(member.start, member.end),
  );
}

/**
 * `cms` with every element on the way down to its signer written with an indefinite length:
 * the ContentInfo, its content, the SignedData, the signers and the signer.
 */
function withIndefiniteLengths(cms: Uint8Array): Uint8Array {
  const indefinite = (tag: number, inner: Uint8Array) =>
    new Uint8Array([tag, 0x80, ...inner, 0x00, 0x00]);
  const contentInfo = readElement(cms, 0, cms.byteLength);
  const [contentType, wrapped] = childrenOf(cms, contentInfo);
  const signedData = childrenOf(cms, wrapped!)[0]!;
  const dataMembers = childrenOf(cms, signedData);
  const signerInfos = dataMembers.at(-1)!;
  const signerInfo = childrenOf(cms, signerInfos)[0]!;
  const signer = indefinite(0x30, cms.subarray(signerInfo.contentStart, signerInfo.contentEnd));
  const signers = indefinite(0x31, signer);
  const data = indefinite(
    0x30,
    new Uint8Array([...cms.subarray(signedData.contentStart, signerInfos.start), ...signers]),
  );
  return indefinite(
    0x30,
    new Uint8Array([
      ...cms.subarray(contentType!.start, contentType!.end),
      ...indefinite(0xa0, data),
    ]),
  );
}

describe.skipIf(!hasOpenSsl)('adding an attribute to a CMS another library made', () => {
  test('with definite lengths: every member stays byte for byte, and OpenSSL still verifies', () => {
    const signer = createOpenSslSigner();
    try {
      const cms = signer.sign(content);
      expect(cms[1]).not.toBe(0x80);
      const added = attribute('1.2.3.4.5', new Uint8Array(300).fill(0xab));
      const grown = addUnsignedAttribute(cms, added);

      let from = 0;
      for (const member of membersOf(cms)) {
        const at = indexOfBytes(grown, member, from);
        expect(at).toBeGreaterThanOrEqual(0);
        from = at + member.byteLength;
      }
      // The attribute sits in a new `[1]` after the signature, the signer's last member.
      expect(indexOfBytes(grown, encodeElement(0xa1, added), from)).toBe(from);
      expect(signer.verifies(grown, content)).toMatchObject({ ok: true });
      expect(signer.verifies(grown, new TextEncoder().encode('something else')).ok).toBe(false);
    } finally {
      signer.dispose();
    }
  });

  test('with the indefinite lengths a streaming encoder writes: they stay indefinite', () => {
    const signer = createOpenSslSigner();
    try {
      const cms = signer.sign(content, { indefinite: true });
      expect(Array.from(cms.subarray(0, 2))).toEqual([0x30, 0x80]);
      const added = attribute('1.2.3.4.5', new Uint8Array(300).fill(0xab));
      const grown = addUnsignedAttribute(cms, added);

      // OpenSSL writes the outer elements without a length and the signer with one: the outer
      // ones are as they were, down to the zeros that end them.
      expect(Array.from(grown.subarray(0, 2))).toEqual([0x30, 0x80]);
      expect(Array.from(grown.subarray(-6))).toEqual(Array.from(cms.subarray(-6)));
      let from = 0;
      for (const member of membersOf(cms)) {
        const at = indexOfBytes(grown, member, from);
        expect(at).toBeGreaterThanOrEqual(0);
        from = at + member.byteLength;
      }
      expect(signer.verifies(grown, content)).toMatchObject({ ok: true });
    } finally {
      signer.dispose();
    }
  });
});

describe('adding an attribute to the unsigned attributes', () => {
  test('no length anywhere on the way: the attribute is the only new bytes', async () => {
    const signer = await createTestSigner();
    const cms = withIndefiniteLengths(
      await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer }),
    );
    expect(await verifyCmsSignature(cms)).toBe('valid');
    const added = attribute('1.2.3.4.5', new Uint8Array(300).fill(0xab));
    const grown = addUnsignedAttribute(cms, added);

    // No length says how long anything is, so no other byte has a reason to change.
    const inserted = encodeElement(0xa1, added);
    const at = indexOfBytes(grown, inserted);
    expect(grown.byteLength).toBe(cms.byteLength + inserted.byteLength);
    expect(Array.from(grown.subarray(0, at))).toEqual(Array.from(cms.subarray(0, at)));
    expect(Array.from(grown.subarray(at + inserted.byteLength))).toEqual(
      Array.from(cms.subarray(at)),
    );
    expect(await verifyCmsSignature(grown)).toBe('valid');
    expect(parseCmsInternal(grown).signerInfo.unsignedAttrs!.attributes).toHaveLength(1);
  });

  test('attributes already there survive, and the new one goes where DER orders it', async () => {
    const signer = await createTestSigner();
    const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
    const first = attribute('1.2.3.4.1', new Uint8Array([1]));
    const last = attribute('1.2.3.4.9', new Uint8Array([9]));
    const middle = attribute('1.2.3.4.5', new Uint8Array([5]));

    const grown = [last, first, middle].reduce(addUnsignedAttribute, cms);

    const internal = parseCmsInternal(grown);
    const types = internal.signerInfo.unsignedAttrs!.attributes.map((present) => present.type);
    expect(types).toEqual(['1.2.3.4.1', '1.2.3.4.5', '1.2.3.4.9']);
    // What was signed is untouched.
    expect(await verifyCmsSignature(grown)).toBe('valid');
    expect(Array.from(internal.parsed.signerCertificate)).toEqual(Array.from(signer.certificate));
  });

  test('zeros a service padded the CMS with are dropped; other trailing bytes are kept', async () => {
    const signer = await createTestSigner();
    const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
    const added = attribute('1.2.3.4.5', new Uint8Array([5]));
    const grown = addUnsignedAttribute(cms, added);

    const padded = new Uint8Array(cms.byteLength + 64);
    padded.set(cms);
    expect(Array.from(addUnsignedAttribute(padded, added))).toEqual(Array.from(grown));

    const followed = new Uint8Array([...cms, 0xde, 0xad]);
    expect(Array.from(addUnsignedAttribute(followed, added))).toEqual([...grown, 0xde, 0xad]);
  });

  test('bytes that are not a CMS are refused, not guessed at', () => {
    const added = attribute('1.2.3.4.5', new Uint8Array([5]));
    expect(() => addUnsignedAttribute(new Uint8Array(), added)).toThrow(CmsError);
    expect(() => addUnsignedAttribute(new Uint8Array([0x30, 0x05, 0x02]), added)).toThrow(CmsError);
    // A sequence without the `[0]` content of a ContentInfo.
    expect(() =>
      addUnsignedAttribute(encodeElement(0x30, new Uint8Array([0x05, 0x00])), added),
    ).toThrow(CmsError);
  });

  test('a signature timestamp attribute is read back as the token it carries', async () => {
    const signer = await createTestSigner();
    const cms = await buildDetachedCms({ digest, hash: 'sha256', profile: 'cades-b', signer });
    const token = new Uint8Array([0x30, 0x03, 0x02, 0x01, 0x07]);
    const tokenOid = new Uint8Array(
      new asn1js.ObjectIdentifier({ value: OID.timestampToken }).toBER(false),
    );
    const grown = addUnsignedAttribute(
      cms,
      encodeElement(0x30, new Uint8Array([...tokenOid, ...encodeElement(0x31, token)])),
    );
    expect(parseCmsInternal(grown).timestampTokens.map((found) => Array.from(found))).toEqual([
      Array.from(token),
    ]);
  });
});
