/**
 * HMAC helpers used by the CDN signers. Thin wrappers over node:crypto
 * for type safety and to centralize the encoding choices.
 */

import { createHmac } from 'node:crypto';

export function hmacSha256(key: Buffer | string, message: Buffer | string): Buffer {
  return createHmac('sha256', key).update(message).digest();
}

export function hmacSha1(key: Buffer | string, message: Buffer | string): Buffer {
  return createHmac('sha1', key).update(message).digest();
}
