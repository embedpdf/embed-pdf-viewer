/**
 * A strict reader of DER, for tests: it says what in a piece of ASN.1 is not DER. PKI.js
 * and OpenSSL also read the looser encodings, so a test that only reads back what was
 * written never sees the difference. A strict reader does (pyHanko refuses a timestamp token
 * that is not DER), and PAdES asks for DER in a signature's `/Contents`.
 *
 * It checks the encoding rules that have one answer: a definite length in its shortest form,
 * no string or number built of parts, a boolean of `00` or `ff`, an integer with no spare
 * leading byte, and the members of a set in ascending order. It does not look inside an octet
 * string or a bit string: give it what they wrap to check that too. It also can't tell that a
 * signer's signed attributes are a set, since they sit under a tag of their own:
 * `signedAttributesAsSet()` hands them over as one.
 */

const UNIVERSAL = 0;
const CONTEXT = 2;
const BOOLEAN = 1;
const INTEGER = 2;
const SEQUENCE = 16;
const SET = 17;
/** The universal types that are built of members; every other one is a single value. */
const BUILT_OF_MEMBERS = new Set([8, 11, SEQUENCE, SET]);

interface Element {
  tagClass: number;
  tagNumber: number;
  constructed: boolean;
  /** Where the element starts, where its content starts, and where it ends. */
  start: number;
  content: number;
  end: number;
}

function readElement(bytes: Uint8Array, start: number, limit: number): Element | string {
  if (start >= limit) return `nothing at byte ${start}`;
  const first = bytes[start]!;
  let at = start + 1;
  let tagNumber = first & 0x1f;
  if (tagNumber === 0x1f) {
    tagNumber = 0;
    let more = true;
    while (more) {
      if (at >= limit) return `a tag runs past the end at byte ${start}`;
      const next = bytes[at++]!;
      tagNumber = tagNumber * 128 + (next & 0x7f);
      more = (next & 0x80) !== 0;
    }
    if (tagNumber < 31) return `a tag below 31 in the long form at byte ${start}`;
  }
  if (at >= limit) return `no length at byte ${start}`;
  const lengthByte = bytes[at++]!;
  let length = lengthByte;
  if (lengthByte === 0x80) return `an indefinite length at byte ${start}`;
  if (lengthByte > 0x80) {
    const count = lengthByte & 0x7f;
    if (at + count > limit) return `a length runs past the end at byte ${start}`;
    if (bytes[at] === 0) return `a length with a spare leading byte at byte ${start}`;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[at++]!;
    if (length < 0x80) return `a short length in the long form at byte ${start}`;
  }
  if (at + length > limit) return `content runs past the end at byte ${start}`;
  return {
    tagClass: first >> 6,
    tagNumber,
    constructed: (first & 0x20) !== 0,
    start,
    content: at,
    end: at + length,
  };
}

/** Compare two encodings as DER orders the members of a set: byte by byte, the shorter first. */
function compareEncodings(a: Uint8Array, b: Uint8Array): number {
  const shared = Math.min(a.length, b.length);
  for (let i = 0; i < shared; i++) {
    if (a[i] !== b[i]) return a[i]! - b[i]!;
  }
  return a.length - b.length;
}

function elementProblem(bytes: Uint8Array, element: Element): string | null {
  const { tagClass, tagNumber, constructed, start, content, end } = element;
  const universal = tagClass === UNIVERSAL;
  if (!constructed) {
    if (universal && BUILT_OF_MEMBERS.has(tagNumber)) {
      return `a sequence or set that is not built of members at byte ${start}`;
    }
    if (universal && tagNumber === BOOLEAN) {
      const value = bytes[content];
      if (end - content !== 1 || (value !== 0x00 && value !== 0xff)) {
        return `a boolean that is not 00 or ff at byte ${start}`;
      }
    }
    if (universal && tagNumber === INTEGER) {
      if (end === content) return `an integer of no bytes at byte ${start}`;
      const spare =
        end - content > 1 &&
        ((bytes[content] === 0x00 && (bytes[content + 1]! & 0x80) === 0) ||
          (bytes[content] === 0xff && (bytes[content + 1]! & 0x80) !== 0));
      if (spare) return `an integer with a spare leading byte at byte ${start}`;
    }
    return null;
  }
  if (universal && !BUILT_OF_MEMBERS.has(tagNumber)) {
    return `a value of universal type ${tagNumber} built of parts at byte ${start}`;
  }
  const members: Uint8Array[] = [];
  let at = content;
  while (at < end) {
    const member = readElement(bytes, at, end);
    if (typeof member === 'string') return member;
    const problem = elementProblem(bytes, member);
    if (problem) return problem;
    members.push(bytes.subarray(member.start, member.end));
    at = member.end;
  }
  if (universal && tagNumber === SET) {
    for (let i = 1; i < members.length; i++) {
      if (compareEncodings(members[i - 1]!, members[i]!) > 0) {
        return `the members of a set out of order at byte ${start}`;
      }
    }
  }
  return null;
}

function membersOf(bytes: Uint8Array, element: Element): Element[] {
  const members: Element[] = [];
  for (let at = element.content; at < element.end; ) {
    const member = readElement(bytes, at, element.end);
    if (typeof member === 'string') throw new Error(member);
    members.push(member);
    at = member.end;
  }
  return members;
}

/**
 * The signed attributes of a CMS's one signer as they are written, tagged as the set they are.
 * In a SignerInfo they sit under `[0]`, so `derProblem()` on the whole CMS never checks their
 * order. RFC 5652 has them signed as a set in DER.
 *
 *     ContentInfo ::= sequence { contentType, content [0] explicit SignedData }
 *     SignedData  ::= sequence { ..., signerInfos set of SignerInfo }
 *     SignerInfo  ::= sequence { version, sid, digestAlgorithm, signedAttrs [0] implicit, ... }
 */
export function signedAttributesAsSet(cms: Uint8Array): Uint8Array {
  const contentInfo = readElement(cms, 0, cms.length);
  if (typeof contentInfo === 'string') throw new Error(contentInfo);
  const signedData = membersOf(cms, membersOf(cms, contentInfo)[1]!)[0]!;
  const signerInfo = membersOf(cms, membersOf(cms, signedData).at(-1)!)[0]!;
  const signed = membersOf(cms, signerInfo).find(
    (member) => member.tagClass === CONTEXT && member.tagNumber === 0,
  );
  if (!signed) throw new Error('the signer has no signed attributes');
  const set = cms.slice(signed.start, signed.end);
  set[0] = 0x31;
  return set;
}

/** What makes `bytes` not one DER value, or null when it is one. */
export function derProblem(bytes: Uint8Array): string | null {
  const element = readElement(bytes, 0, bytes.length);
  if (typeof element === 'string') return element;
  if (element.end !== bytes.length) return `${bytes.length - element.end} bytes after the value`;
  return elementProblem(bytes, element);
}
