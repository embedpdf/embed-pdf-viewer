import { createHmac, timingSafeEqual } from 'node:crypto';
import { PASSWORD_SESSION_GRANT_VERSION } from './constants';
import type { PasswordSessionBinding, PasswordSessionServerSecret } from './types';

export function signPasswordGrant(input: {
  binding: PasswordSessionBinding;
  expiresAt: number;
  renewableUntil: number;
  serverSecret: PasswordSessionServerSecret;
}): string {
  const payload = {
    v: PASSWORD_SESSION_GRANT_VERSION,
    ...input.binding,
    exp: input.expiresAt,
    renewableUntil: input.renewableUntil,
    serverSecretId: input.serverSecret.id,
  };
  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = createHmac('sha256', input.serverSecret.secret)
    .update(payloadB64)
    .digest('base64url');
  return `${payloadB64}.${sig}`;
}

export function verifyPasswordGrant(input: {
  grant: string;
  binding: PasswordSessionBinding;
  now: number;
  serverSecret: PasswordSessionServerSecret;
}): { expiresAt: number; renewableUntil: number } | null {
  const [payloadB64, sig] = input.grant.split('.');
  if (!payloadB64 || !sig) return null;
  const expected = createHmac('sha256', input.serverSecret.secret)
    .update(payloadB64)
    .digest('base64url');
  if (!timingSafeStringEqual(sig, expected)) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
  } catch {
    return null;
  }
  if (payload['v'] !== PASSWORD_SESSION_GRANT_VERSION) return null;
  if (payload['serverSecretId'] !== input.serverSecret.id) return null;
  for (const key of Object.keys(input.binding) as Array<keyof PasswordSessionBinding>) {
    if (payload[key] !== input.binding[key]) return null;
  }
  const expiresAt = typeof payload['exp'] === 'number' ? payload['exp'] : 0;
  const renewableUntil =
    typeof payload['renewableUntil'] === 'number' ? payload['renewableUntil'] : 0;
  if (expiresAt <= input.now || renewableUntil <= input.now) return null;
  return { expiresAt, renewableUntil };
}

function timingSafeStringEqual(a: string, b: string): boolean {
  const aBytes = Buffer.from(a);
  const bBytes = Buffer.from(b);
  return aBytes.byteLength === bBytes.byteLength && timingSafeEqual(aBytes, bBytes);
}
