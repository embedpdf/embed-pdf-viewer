/** Base64 to bytes, without `atob` (which DOM-free code can't assume). */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const VALUES = new Uint8Array(128);
for (let index = 0; index < ALPHABET.length; index += 1) VALUES[ALPHABET.charCodeAt(index)] = index;

export function decodeBase64(text: string): Uint8Array {
  const padding = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const bytes = new Uint8Array((text.length / 4) * 3 - padding);
  let at = 0;
  for (let index = 0; index < text.length; index += 4) {
    const chunk =
      (VALUES[text.charCodeAt(index)]! << 18) |
      (VALUES[text.charCodeAt(index + 1)]! << 12) |
      (VALUES[text.charCodeAt(index + 2)]! << 6) |
      VALUES[text.charCodeAt(index + 3)]!;
    if (at < bytes.length) bytes[at++] = chunk >> 16;
    if (at < bytes.length) bytes[at++] = (chunk >> 8) & 0xff;
    if (at < bytes.length) bytes[at++] = chunk & 0xff;
  }
  return bytes;
}
