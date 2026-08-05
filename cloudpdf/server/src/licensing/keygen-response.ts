/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.md.
 */
import { createHash, createPublicKey, verify } from 'node:crypto';

import type { CloudPdfLicenseIdentity } from './product';

const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');
const requiredSignedHeaders = '(request-target) host date digest';
const liveResponseSkewMs = 5 * 60 * 1_000;

export interface KeygenResponseProof {
  bodyBase64: string;
  date: string;
  digest: string;
  keygenSignature: string;
  version: 1;
}

export interface VerifiedKeygenResponse {
  body: Record<string, unknown>;
  dateMs: number;
}

export function captureAndVerifyKeygenResponse(input: {
  body: Buffer;
  date: string | null;
  digest: string | null;
  identity: CloudPdfLicenseIdentity;
  keygenSignature: string | null;
  method: string;
  now?: number;
  requestUrl: URL;
}): { proof: KeygenResponseProof; verified: VerifiedKeygenResponse } {
  const proof: KeygenResponseProof = {
    bodyBase64: input.body.toString('base64'),
    date: requireHeader(input.date, 'Date'),
    digest: requireHeader(input.digest, 'Digest'),
    keygenSignature: requireHeader(input.keygenSignature, 'Keygen-Signature'),
    version: 1,
  };
  return {
    proof,
    verified: verifyKeygenResponseProof({
      identity: input.identity,
      method: input.method,
      now: input.now,
      proof,
      requestUrl: input.requestUrl,
      requireFreshDate: true,
    }),
  };
}

export function verifyKeygenResponseProof(input: {
  identity: CloudPdfLicenseIdentity;
  method: string;
  now?: number;
  proof: KeygenResponseProof;
  requestUrl: URL;
  requireFreshDate: boolean;
}): VerifiedKeygenResponse {
  if (input.proof.version !== 1) {
    throw new Error('Keygen response proof version is unsupported');
  }
  const bodyBytes = decodeBase64(input.proof.bodyBase64, 'body');
  const expectedDigest = `sha-256=${createHash('sha256').update(bodyBytes).digest('base64')}`;
  if (input.proof.digest !== expectedDigest) {
    throw new Error('Keygen response digest is invalid');
  }

  const dateMs = new Date(input.proof.date).getTime();
  if (!Number.isFinite(dateMs)) throw new Error('Keygen response Date is invalid');
  if (input.requireFreshDate) {
    const now = input.now ?? Date.now();
    if (dateMs < now - liveResponseSkewMs || dateMs > now + liveResponseSkewMs) {
      throw new Error('Keygen response Date is outside the allowed five-minute window');
    }
  }

  const signature = parseSignatureHeader(input.proof.keygenSignature);
  if (signature.keyid !== input.identity.accountId) {
    throw new Error('Keygen response signature belongs to another account');
  }
  if (signature.algorithm !== 'ed25519') {
    throw new Error(`Unsupported Keygen response signature algorithm: ${signature.algorithm}`);
  }
  if (signature.headers !== requiredSignedHeaders) {
    throw new Error('Keygen response signature covers an unexpected header set');
  }

  const signingData = [
    `(request-target): ${input.method.toLowerCase()} ${input.requestUrl.pathname}${input.requestUrl.search}`,
    `host: ${input.requestUrl.host}`,
    `date: ${input.proof.date}`,
    `digest: ${expectedDigest}`,
  ].join('\n');
  const signatureBytes = decodeBase64(signature.signature, 'signature');
  const verificationKeys = [
    input.identity.publicKeyHex,
    ...(input.identity.previousPublicKeyHexes ?? []),
  ];
  const valid = verificationKeys.some((publicKeyHex) => {
    const publicKey = createPublicKey({
      format: 'der',
      key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(publicKeyHex, 'hex')]),
      type: 'spki',
    });
    return verify(null, Buffer.from(signingData, 'utf8'), publicKey, signatureBytes);
  });
  if (!valid) throw new Error('Keygen response signature is invalid');

  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyBytes.toString('utf8'));
  } catch {
    throw new Error('Keygen response body is not valid JSON');
  }
  if (!isObject(parsed)) throw new Error('Keygen response body is invalid');
  return { body: parsed, dateMs };
}

function parseSignatureHeader(value: string): {
  algorithm: string;
  headers: string;
  keyid: string;
  signature: string;
} {
  const fields = new Map<string, string>();
  const matcher = /(?:^|,\s*)(keyid|algorithm|signature|headers)="([^"]*)"/g;
  for (const match of value.matchAll(matcher)) {
    const name = match[1];
    const fieldValue = match[2];
    if (!name || fieldValue === undefined || fields.has(name)) {
      throw new Error('Keygen-Signature header is invalid');
    }
    fields.set(name, fieldValue);
  }
  if (fields.size !== 4) throw new Error('Keygen-Signature header is incomplete');
  return {
    algorithm: fields.get('algorithm')!,
    headers: fields.get('headers')!,
    keyid: fields.get('keyid')!,
    signature: fields.get('signature')!,
  };
}

function decodeBase64(value: string, name: string): Buffer {
  if (!value || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) {
    throw new Error(`Keygen response ${name} is not valid base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`Keygen response ${name} is not canonical base64`);
  }
  return decoded;
}

function requireHeader(value: string | null, name: string): string {
  if (!value) throw new Error(`Keygen response is missing the ${name} header`);
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
