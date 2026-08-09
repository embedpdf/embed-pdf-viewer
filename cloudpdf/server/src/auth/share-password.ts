import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * Passphrase hashing for share grants.
 *
 * A share token is machine randomness and safe to store plaintext; a
 * grant passphrase is HUMAN-chosen — people reuse passwords from their
 * real lives — so the moment we accept one it gets password
 * discipline: scrypt with a per-grant salt, constant-time compare,
 * never logged, never returned by any read endpoint.
 *
 * Envelope format (self-describing so parameters can be raised without
 * a migration): `scrypt$N$r$p$<salt-b64url>$<hash-b64url>`. Verify
 * reads the parameters from the envelope, so old rows keep verifying
 * after the defaults change.
 */

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;

export function hashSharePassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
  });
  return [
    'scrypt',
    String(SCRYPT_N),
    String(SCRYPT_R),
    String(SCRYPT_P),
    salt.toString('base64url'),
    hash.toString('base64url'),
  ].join('$');
}

/** Constant-time verify; malformed envelopes never match — fail closed. */
export function verifySharePassword(password: string, envelope: string): boolean {
  const parts = envelope.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isSafeInteger(N) || !Number.isSafeInteger(r) || !Number.isSafeInteger(p)) {
    return false;
  }
  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4]!, 'base64url');
    expected = Buffer.from(parts[5]!, 'base64url');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;
  let actual: Buffer;
  try {
    actual = scryptSync(password, salt, expected.length, { N, r, p, maxmem: 128 * 1024 * 1024 });
  } catch {
    return false;
  }
  return timingSafeEqual(actual, expected);
}
