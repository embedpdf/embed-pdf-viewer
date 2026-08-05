import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

/**
 * Lightweight, **unverified** JWT payload decoder.
 *
 * We use this on the SDK side purely to extract routing information
 * (the `doc_id` claim) so we know which `/v1/docs/:id/head` URL to
 * hit. Signature verification is the server's job — Layer 2 of the
 * token-class-confusion defense in `JwtVerifier.coerceClaims`
 * rejects anything malformed before the bytes are accepted.
 *
 * This module is intentionally cryptography-free: it never imports
 * `crypto` or `jose`. That keeps the SDK lean for browser bundles
 * (jose adds ~50KB minified) and means a misconfigured customer
 * can't accidentally rely on client-side verification.
 */

export interface UnverifiedClaims {
  doc_id?: string;
  tenant_id?: string;
  sub?: string;
  exp?: number;
  iat?: number;
  /** Pass-through; we don't validate anything else SDK-side. */
  [key: string]: unknown;
}

export function decodeUnverifiedClaims(token: string): UnverifiedClaims {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'malformed jwt: expected 3 segments');
  }
  const payloadB64Url = parts[1]!;
  let bytes: Uint8Array;
  try {
    bytes = base64UrlDecode(payloadB64Url);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `malformed jwt payload: ${(err as Error).message ?? err}`,
    );
  }
  let json: string;
  try {
    json = new TextDecoder().decode(bytes);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `jwt payload is not valid utf-8: ${(err as Error).message ?? err}`,
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (err) {
    throw new EngineError(
      EngineErrorCode.InvalidArg,
      `jwt payload is not valid json: ${(err as Error).message ?? err}`,
    );
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new EngineError(EngineErrorCode.InvalidArg, 'jwt payload must be a json object');
  }
  return parsed as UnverifiedClaims;
}

/**
 * Decode a base64url string into a `Uint8Array`. Works in both Node
 * and modern browsers; we avoid `Buffer` so the SDK stays
 * browser-friendly. `atob` lives on the global in Node 16+ as well.
 */
function base64UrlDecode(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4;
  const padded = pad === 0 ? b64 : b64 + '='.repeat(4 - pad);
  const bin = atob(padded);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
