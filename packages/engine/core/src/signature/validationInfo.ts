import type { ValidationInfoKind } from './types';

/** The lists of a `ValidationInfo`, in the order they are read and written. */
export const VALIDATION_INFO_KINDS = [
  'certificates',
  'ocspResponses',
  'crls',
] as const satisfies readonly ValidationInfoKind[];

/**
 * The largest entry `addValidationInfo()` stores. Certificates and OCSP
 * responses are a few kilobytes; a CRL of a large issuer can be megabytes.
 */
export const VALIDATION_INFO_LIMITS = { entryBytes: 16 * 1024 * 1024 } as const;

/** How deep the elements of an entry may nest. */
const MAX_DEPTH = 64;

/**
 * Why `bytes` can't be stored as an entry of a document's validation data,
 * or null when it can: one DER sequence that spans the bytes exactly, every
 * element inside it filling its parent, and no larger than the limit. A
 * certificate, an OCSP response and a CRL are each such a sequence. What the
 * entry says, and whether its signature holds, is not looked at.
 */
export function validationInfoEntryProblem(bytes: Uint8Array): string | null {
  if (bytes.length === 0) return 'it is empty';
  if (bytes.length > VALIDATION_INFO_LIMITS.entryBytes) {
    return `it is larger than ${VALIDATION_INFO_LIMITS.entryBytes} bytes`;
  }
  if (bytes[0] !== 0x30) return 'it is not a DER SEQUENCE';
  const outer = elementAt(bytes, 0, bytes.length);
  if (!outer) return 'its length is not a DER length, or names more bytes than there are';
  if (outer.end !== bytes.length) return 'bytes follow the object';
  return fills(bytes, outer.contents, outer.end, 1) ? null : 'an element inside it is malformed';
}

/** One element's extent: where its contents begin and where it ends. */
interface Element {
  constructed: boolean;
  contents: number;
  end: number;
}

/** The element that starts at `at`, or null when its header is not one or runs past `limit`. */
function elementAt(bytes: Uint8Array, at: number, limit: number): Element | null {
  let cursor = at;
  if (cursor >= limit) return null;
  const identifier = bytes[cursor++]!;
  if ((identifier & 0x1f) === 0x1f) {
    // A tag number of 31 or more takes further bytes, the last without the high bit.
    for (;;) {
      if (cursor >= limit) return null;
      if ((bytes[cursor++]! & 0x80) === 0) break;
    }
  }
  if (cursor >= limit) return null;
  const first = bytes[cursor++]!;
  let length = first;
  if (first & 0x80) {
    const count = first & 0x7f;
    // 0 is the indefinite form, which DER does not have.
    if (count === 0 || count > 4 || cursor + count > limit) return null;
    length = 0;
    for (let i = 0; i < count; i++) length = length * 256 + bytes[cursor++]!;
  }
  const end = cursor + length;
  if (end > limit) return null;
  return { constructed: (identifier & 0x20) !== 0, contents: cursor, end };
}

/** Whether `[from, to)` is a run of elements, each of whose own elements fills it in turn. */
function fills(bytes: Uint8Array, from: number, to: number, depth: number): boolean {
  if (depth > MAX_DEPTH) return false;
  let cursor = from;
  while (cursor < to) {
    const element = elementAt(bytes, cursor, to);
    if (!element) return false;
    if (element.constructed && !fills(bytes, element.contents, element.end, depth + 1)) {
      return false;
    }
    cursor = element.end;
  }
  return cursor === to;
}
