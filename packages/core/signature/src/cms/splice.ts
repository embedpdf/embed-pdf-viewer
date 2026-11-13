/**
 * Editing a CMS in place. A signature someone else encoded can't be parsed and written back
 * whole: writing a certificate out again need not give the bytes that were signed. So an edit
 * here copies every byte it doesn't change, and only rewrites the length in front of each
 * element the change sits in. A length written as indefinite stays indefinite.
 */
import { CmsError } from './parse';

/** One encoded element, by its offsets in the bytes it was read from. */
export interface BerElement {
  /** Where its identifier octets begin. */
  start: number;
  /** Where its length octets begin: just past the identifier. */
  lengthStart: number;
  /** Where its content begins. */
  contentStart: number;
  /** Just past its content: for an indefinite length, where its end-of-contents octets begin. */
  contentEnd: number;
  /** Just past the whole element. */
  end: number;
  /** Its first identifier octet. */
  tag: number;
  /** Its length is written as indefinite: the content ends at two zero octets. */
  indefinite: boolean;
}

/** Read the element at `start`, which must end at or before `limit`. Throws `CmsError`. */
export function readElement(bytes: Uint8Array, start: number, limit: number): BerElement {
  const malformed = () => new CmsError('malformed', 'CMS is not valid BER');
  let at = start;
  if (at >= limit) throw malformed();
  const tag = bytes[at++]!;
  if ((tag & 0x1f) === 0x1f) {
    // A tag number above 30 continues while the high bit is set.
    while (at < limit && (bytes[at]! & 0x80) !== 0) at++;
    at++;
  }
  const lengthStart = at;
  if (at >= limit) throw malformed();
  const first = bytes[at++]!;
  if (first === 0x80) {
    const contentStart = at;
    while (!(bytes[at] === 0 && bytes[at + 1] === 0)) {
      at = readElement(bytes, at, limit).end;
      if (at + 1 >= limit) throw malformed();
    }
    return {
      start,
      lengthStart,
      contentStart,
      contentEnd: at,
      end: at + 2,
      tag,
      indefinite: true,
    };
  }
  let length = first;
  if (first > 0x80) {
    const count = first & 0x7f;
    if (count > 6 || at + count > limit) throw malformed();
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[at++]!;
  }
  if (at + length > limit) throw malformed();
  return {
    start,
    lengthStart,
    contentStart: at,
    contentEnd: at + length,
    end: at + length,
    tag,
    indefinite: false,
  };
}

/** The elements a constructed element holds, in order. */
export function childrenOf(bytes: Uint8Array, parent: BerElement): BerElement[] {
  const children: BerElement[] = [];
  for (let at = parent.contentStart; at < parent.contentEnd; ) {
    const child = readElement(bytes, at, parent.contentEnd);
    children.push(child);
    at = child.end;
  }
  return children;
}

/** A definite length, in the fewest octets (DER). */
function encodeLength(length: number): Uint8Array {
  if (length < 0x80) return new Uint8Array([length]);
  const octets: number[] = [];
  for (let rest = length; rest > 0; rest = Math.floor(rest / 256)) octets.unshift(rest % 256);
  return new Uint8Array([0x80 | octets.length, ...octets]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.byteLength;
  }
  return out;
}

/** An element with a tag of one octet, a definite length and `content`. */
export function encodeElement(tag: number, content: Uint8Array): Uint8Array {
  return concat(new Uint8Array([tag]), encodeLength(content.byteLength), content);
}

/** `element` with other content: its identifier as written, and its length kept indefinite when it was. */
function withContent(bytes: Uint8Array, element: BerElement, content: Uint8Array): Uint8Array {
  const identifier = bytes.subarray(element.start, element.lengthStart);
  return element.indefinite
    ? concat(identifier, new Uint8Array([0x80]), content, new Uint8Array([0, 0]))
    : concat(identifier, encodeLength(content.byteLength), content);
}

/** `parent` with the bytes of one of its children replaced. */
function withChild(
  bytes: Uint8Array,
  parent: BerElement,
  child: BerElement,
  replacement: Uint8Array,
): Uint8Array {
  return withContent(
    bytes,
    parent,
    concat(
      bytes.subarray(parent.contentStart, child.start),
      replacement,
      bytes.subarray(child.end, parent.contentEnd),
    ),
  );
}

/** How DER orders the elements of a set: by their encodings, octet by octet. */
function comesBefore(left: Uint8Array, right: Uint8Array): boolean {
  const shared = Math.min(left.byteLength, right.byteLength);
  for (let i = 0; i < shared; i++) {
    if (left[i] !== right[i]) return left[i]! < right[i]!;
  }
  return left.byteLength < right.byteLength;
}

/**
 * Add one attribute (its DER) to the unsigned attributes of a CMS's one signer. Every other
 * byte of the signer's part of the CMS, and everything outside it, is copied as it was; only
 * the lengths in front of the elements that grew are written again. The unsigned attributes
 * are created when the signer has none, and the attribute goes where DER orders it among the
 * ones already there. Throws `CmsError`.
 *
 *     ContentInfo ::= sequence { contentType, content [0] explicit SignedData }
 *     SignedData  ::= sequence { ..., signerInfos set of SignerInfo }
 *     SignerInfo  ::= sequence { ..., signature octet string, unsignedAttrs [1] implicit optional }
 */
export function addUnsignedAttribute(cms: Uint8Array, attribute: Uint8Array): Uint8Array {
  const unexpected = (what: string) => new CmsError('malformed', `CMS has no ${what}`);
  const contentInfo = readElement(cms, 0, cms.byteLength);
  const content = childrenOf(cms, contentInfo).find((child) => child.tag === 0xa0);
  if (!content) throw unexpected('content');
  const signedData = childrenOf(cms, content)[0];
  if (!signedData || signedData.tag !== 0x30) throw unexpected('SignedData');
  const signerInfos = childrenOf(cms, signedData).at(-1);
  if (!signerInfos || signerInfos.tag !== 0x31) throw unexpected('signers');
  const signers = childrenOf(cms, signerInfos);
  if (signers.length !== 1 || signers[0]!.tag !== 0x30) {
    throw new CmsError('unsupported', `CMS has ${signers.length} signers; exactly one is expected`);
  }
  const signerInfo = signers[0]!;
  const unsigned = childrenOf(cms, signerInfo).find((child) => child.tag === 0xa1);

  let grownSigner: Uint8Array;
  if (unsigned) {
    const present = childrenOf(cms, unsigned);
    const next = present.find(
      (child) => !comesBefore(cms.subarray(child.start, child.end), attribute),
    );
    const at = next ? next.start : unsigned.contentEnd;
    const grownSet = withContent(
      cms,
      unsigned,
      concat(
        cms.subarray(unsigned.contentStart, at),
        attribute,
        cms.subarray(at, unsigned.contentEnd),
      ),
    );
    grownSigner = withChild(cms, signerInfo, unsigned, grownSet);
  } else {
    grownSigner = withContent(
      cms,
      signerInfo,
      concat(
        cms.subarray(signerInfo.contentStart, signerInfo.contentEnd),
        encodeElement(0xa1, attribute),
      ),
    );
  }
  const grownSigners = withChild(cms, signerInfos, signerInfo, grownSigner);
  const grownSignedData = withChild(cms, signedData, signerInfos, grownSigners);
  const grownContent = withChild(cms, content, signedData, grownSignedData);
  const grown = withChild(cms, contentInfo, content, grownContent);
  // What follows the CMS is kept, unless it is only the zeros a service padded it with.
  const trailing = cms.subarray(contentInfo.end);
  return trailing.some((octet) => octet !== 0) ? concat(grown, trailing) : grown;
}
