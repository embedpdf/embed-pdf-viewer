/**
 * Generate an RFC 4122 v4 UUID using the Web Crypto API surface available in
 * every realm this code runs in: Node 19+, Web Workers, browsers on https,
 * http, intranet and file: pages, and edge runtimes.
 *
 * Why this implementation:
 *   - `crypto.randomUUID()` is limited to secure contexts in some browsers;
 *     `getRandomValues()` has no such restriction.
 *   - `import { randomUUID } from 'crypto'` makes Vite externalize the
 *     `crypto` module for browser builds and fail at runtime.
 *
 * Output is the canonical hex form: `xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx`,
 * where `y` is one of `8/9/a/b` (variant nibble = 10xx).
 */
export function generateUuid(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  // RFC 4122 §4.4: version nibble = 4, variant nibble = 10xx.
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

/**
 * Generate an RFC 9562 v7 UUID: the Unix time in milliseconds in the first
 * 48 bits, then random bits. Names made later sort later, which is what an
 * annotation's `/NM` gets when the data names none.
 */
export function generateUuidV7(now: number = Date.now()): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  // 48-bit big-endian milliseconds. Division, not shifts: the value passes
  // 32 bits.
  let time = Math.max(0, Math.floor(now));
  for (let i = 5; i >= 0; i--) {
    bytes[i] = time % 256;
    time = Math.floor(time / 256);
  }
  // RFC 9562 §5.7: version nibble = 7, variant nibble = 10xx.
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  return formatUuid(bytes);
}

function formatUuid(bytes: Uint8Array): string {
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
