import * as pkijs from 'pkijs';

let ensured = false;

/**
 * PKI.js needs a WebCrypto engine. Browsers and Node ≥ 19 expose
 * `globalThis.crypto`; register it once, lazily, so importing this package
 * has no side effect.
 */
export function ensureEngine(): pkijs.ICryptoEngine {
  if (!ensured) {
    ensured = true;
    if (!pkijs.getCrypto()) {
      const webcrypto = globalThis.crypto;
      if (!webcrypto?.subtle) {
        throw new Error('@embedpdf/core-signature needs WebCrypto (globalThis.crypto.subtle)');
      }
      pkijs.setEngine('embedpdf', new pkijs.CryptoEngine({ name: 'embedpdf', crypto: webcrypto }));
    }
  }
  return pkijs.getCrypto(true);
}

/**
 * Random octets that are a positive integer in DER as they are, for a serial number or a
 * nonce. DER writes an integer in the fewest octets: a first octet of zero in front of a
 * positive number is one too many, and a strict reader refuses it. A first octet with its top
 * bit set makes the number negative. So the first octet is between `40` and `7f`.
 */
export function randomPositiveInteger(): Uint8Array {
  const octets = globalThis.crypto.getRandomValues(new Uint8Array(8));
  octets[0] = (octets[0]! & 0x7f) | 0x40;
  return octets;
}

export function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(view.byteLength);
  copy.set(view);
  return copy.buffer;
}

export function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.byteLength !== right.byteLength) return false;
  for (let i = 0; i < left.byteLength; i++) if (left[i] !== right[i]) return false;
  return true;
}

export function toHex(bytes: Uint8Array): string {
  let out = '';
  for (const byte of bytes) out += byte.toString(16).padStart(2, '0');
  return out;
}
