/**
 * Standard base64 (RFC 4648 §4), dependency-free: no Buffer, the same in
 * browsers, workers and Node. Encoding and decoding write into one
 * preallocated buffer, so a resource of tens of megabytes costs one pass.
 */

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const PADDING = 0x3d; // '='

const ENCODE = Uint8Array.from(BASE64_ALPHABET, (character) => character.charCodeAt(0));
const DECODE = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < BASE64_ALPHABET.length; i++) table[BASE64_ALPHABET.charCodeAt(i)] = i;
  return table;
})();

/** Padded base64 of `bytes`. */
export function toBase64(bytes: Uint8Array): string {
  const out = new Uint8Array(4 * Math.ceil(bytes.length / 3));
  let written = 0;
  let i = 0;
  for (; i + 2 < bytes.length; i += 3) {
    const triple = (bytes[i]! << 16) | (bytes[i + 1]! << 8) | bytes[i + 2]!;
    out[written++] = ENCODE[triple >> 18]!;
    out[written++] = ENCODE[(triple >> 12) & 0x3f]!;
    out[written++] = ENCODE[(triple >> 6) & 0x3f]!;
    out[written++] = ENCODE[triple & 0x3f]!;
  }
  const rest = bytes.length - i;
  if (rest > 0) {
    const triple = (bytes[i]! << 16) | (rest === 2 ? bytes[i + 1]! << 8 : 0);
    out[written++] = ENCODE[triple >> 18]!;
    out[written++] = ENCODE[(triple >> 12) & 0x3f]!;
    out[written++] = rest === 2 ? ENCODE[(triple >> 6) & 0x3f]! : PADDING;
    out[written++] = PADDING;
  }
  return new TextDecoder().decode(out);
}

/**
 * The number of bytes `encoded` decodes to, without decoding it, or `null`
 * when it can't be base64. Padding is optional, as {@link fromBase64} reads it.
 */
export function decodedLengthOf(encoded: string): number | null {
  const end = unpaddedLengthOf(encoded);
  if (end % 4 === 1) return null;
  return Math.floor((end * 3) / 4);
}

/** The bytes padded or unpadded base64 holds; throws on anything else. */
export function fromBase64(encoded: string): Uint8Array {
  const end = unpaddedLengthOf(encoded);
  if (end % 4 === 1) throw new Error('malformed base64');
  const out = new Uint8Array(Math.floor((end * 3) / 4));
  let written = 0;
  let buffer = 0;
  let bits = 0;
  for (let i = 0; i < end; i++) {
    const code = encoded.charCodeAt(i);
    const value = code < 128 ? DECODE[code]! : -1;
    if (value < 0) throw new Error('malformed base64');
    buffer = ((buffer << 6) | value) & 0xffffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[written++] = (buffer >> bits) & 0xff;
    }
  }
  return out;
}

// Trailing padding, scanned backward to avoid regex backtracking on long runs.
function unpaddedLengthOf(encoded: string): number {
  let end = encoded.length;
  while (end > 0 && encoded.charCodeAt(end - 1) === PADDING) end -= 1;
  return end;
}
