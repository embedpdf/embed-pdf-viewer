/**
 * The revocation answers a CMS carries itself: Acrobat's `adbe-revocationInfoArchival` signed
 * attribute, read from a signature pyHanko wrote and Acrobat reports as LTV enabled, and the
 * `crls` field of the SignedData. What comes out is checked like any other answer.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as asn1js from 'asn1js';
import * as pkijs from 'pkijs';
import { describe, expect, test } from 'vitest';

import { toArrayBuffer } from '../../src/cms/engine';
import { OID } from '../../src/cms/oids';
import { certificateFromDer, readCmsParts } from '../../src/cms/parse';
import { checkRevocationAnswer } from '../../src/revocation/answer';

const here = dirname(fileURLToPath(import.meta.url));
const documents = resolve(here, '../../../../engine/main/test/fixtures/signature-long-term');
const fixtures = resolve(here, '../fixtures/long-term');
const fixture = async (name: string) => new Uint8Array(await readFile(resolve(fixtures, name)));

/** The CMS of a file's first signature: its `/Contents`, without the padding after it. */
async function firstCms(name: string): Promise<Uint8Array> {
  const pdf = (await readFile(resolve(documents, name))).toString('latin1');
  const hex = /\/Contents\s*<([0-9a-fA-F]+)>/.exec(pdf)?.[1];
  if (!hex) throw new Error(`${name} has no signature`);
  const bytes = Buffer.from(hex, 'hex');
  // A sequence with a two-byte length: every CMS here is between 256 bytes and 64 KB.
  expect([bytes[0], bytes[1]]).toEqual([0x30, 0x82]);
  return new Uint8Array(bytes.subarray(0, ((bytes[2]! << 8) | bytes[3]!) + 4));
}

/** One DER element: a tag, the length of what follows, and that. The answers go in byte for byte. */
function element(tag: number, ...contents: Uint8Array[]): Uint8Array {
  const length = contents.reduce((sum, part) => sum + part.length, 0);
  const header =
    length < 0x80
      ? [tag, length]
      : length < 0x100
        ? [tag, 0x81, length]
        : length < 0x10000
          ? [tag, 0x82, length >> 8, length & 0xff]
          : [tag, 0x83, length >> 16, (length >> 8) & 0xff, length & 0xff];
  return new Uint8Array(Buffer.concat([Uint8Array.from(header), ...contents]));
}
const identifier = (value: string) =>
  new Uint8Array(new asn1js.ObjectIdentifier({ value }).toBER(false));
/** A choice that is not a CRL: `[1] { format, the answer }`. */
const other = (format: string, der: Uint8Array) => element(0xa1, identifier(format), der);

/** `cms` again, with `choices` as the `crls` field of its SignedData: before the signer, its last member. */
function withCrlsField(cms: Uint8Array, choices: Uint8Array[]): Uint8Array {
  const info = new pkijs.ContentInfo({ schema: asn1js.fromBER(toArrayBuffer(cms)).result });
  const members: Uint8Array[] = (info.content as asn1js.Sequence).valueBlock.value.map(
    (member) => new Uint8Array(member.toBER(false)),
  );
  members.splice(members.length - 1, 0, element(0xa1, ...choices));
  return element(0x30, identifier(OID.signedData), element(0xa0, element(0x30, ...members)));
}

describe('revocation answers inside a CMS', () => {
  test("Acrobat's signed attribute: an OCSP response and a CRL, and both check out", async () => {
    const parts = readCmsParts(await firstCms('iso-p1-answers-in-signature.pdf'));
    expect(parts.revocation.ocspResponses).toHaveLength(1);
    expect(parts.revocation.crls).toHaveLength(1);

    const intermediate = certificateFromDer(await fixture('intermediate.cer'));
    // About the signer, from the authority that issued it.
    expect(
      await checkRevocationAnswer({
        answer: { kind: 'ocsp', der: parts.revocation.ocspResponses[0]! },
        certificate: parts.signerCertificate!,
        issuer: intermediate,
      }),
    ).toMatchObject({ says: 'good', responder: await fixture('ocsp-responder.cer') });
    // About that authority, from the root.
    expect(
      await checkRevocationAnswer({
        answer: { kind: 'crl', der: parts.revocation.crls[0]! },
        certificate: intermediate,
        issuer: certificateFromDer(await fixture('root.cer')),
      }),
    ).toMatchObject({ says: 'good' });
  });

  test('a signature that carries none', async () => {
    const parts = readCmsParts(await firstCms('ours-b-t.pdf'));
    expect(parts.revocation).toEqual({ ocspResponses: [], crls: [] });
  });

  test('the `crls` field: a CRL, an OCSP response, and a format this package does not know', async () => {
    const crl = await fixture('root.crl');
    const ocsp = await fixture('signer.ocsp');
    const cms = withCrlsField(await firstCms('ours-b-t.pdf'), [
      crl,
      other(OID.ocspResponseInfo, ocsp),
      other('1.2.3.4.5', ocsp),
    ]);
    // Byte for byte what went in: these are stored and digested as they are.
    expect(readCmsParts(cms).revocation).toEqual({ ocspResponses: [ocsp], crls: [crl] });
  });

  test('a signature that carries answers both ways hands over all of them', async () => {
    const original = readCmsParts(await firstCms('iso-p1-answers-in-signature.pdf')).revocation;
    const crl = await fixture('root.crl');
    const ocsp = await fixture('signer.ocsp');
    const cms = withCrlsField(await firstCms('iso-p1-answers-in-signature.pdf'), [
      crl,
      other(OID.ocspResponseInfo, ocsp),
    ]);
    expect(readCmsParts(cms).revocation).toEqual({
      ocspResponses: [ocsp, ...original.ocspResponses],
      crls: [crl, ...original.crls],
    });
  });
});
