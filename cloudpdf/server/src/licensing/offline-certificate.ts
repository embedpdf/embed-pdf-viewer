/**
 * @license FCL-1.0-ALv2
 *
 * WARNING: This file is part of CloudPDF's license-key functionality. Removing
 * or modifying this code to disable or circumvent license enforcement, enable
 * protected functionality without a valid license key, or remove protected
 * functionality is a breach of FCL-1.0-ALv2 while this release is governed by
 * that license. See cloudpdf/server/LICENSE.
 */
import { createPublicKey, verify } from 'node:crypto';

import type { CloudPdfLicenseIdentity } from './product';

const begin = '-----BEGIN MACHINE FILE-----';
const end = '-----END MACHINE FILE-----';
const ed25519SpkiPrefix = Buffer.from('302a300506032b6570032100', 'hex');

export interface VerifiedMachineCertificate {
  artifactExpiresAt: string;
  artifactIssuedAt: string;
  fingerprint: string;
  licenseExpiresAt: string | null;
  licenseId: string;
  metadata: Record<string, unknown>;
  rawPayload: Record<string, unknown>;
}

export function verifyMachineCertificate(input: {
  allowExpired?: boolean;
  certificate: string;
  expectedFingerprint: string;
  identity: CloudPdfLicenseIdentity;
  now?: Date;
}): VerifiedMachineCertificate {
  const encoded = stripCertificate(input.certificate);
  const envelope = parseObject(Buffer.from(encoded, 'base64').toString('utf8'));
  const alg = stringValue(envelope, 'alg');
  const enc = stringValue(envelope, 'enc');
  const signature = stringValue(envelope, 'sig');

  if (alg !== 'base64+ed25519') {
    throw new Error(`Unsupported machine certificate algorithm: ${alg}`);
  }

  const signedPayload = Buffer.from(`machine/${enc}`, 'utf8');
  const signatureBytes = Buffer.from(signature, 'base64');
  const verificationKeys = [
    input.identity.publicKeyHex,
    ...(input.identity.previousPublicKeyHexes ?? []),
  ];
  const validSignature = verificationKeys.some((publicKeyHex) => {
    const publicKey = createPublicKey({
      format: 'der',
      key: Buffer.concat([ed25519SpkiPrefix, Buffer.from(publicKeyHex, 'hex')]),
      type: 'spki',
    });
    return verify(null, signedPayload, publicKey, signatureBytes);
  });

  if (!validSignature) {
    throw new Error('Machine certificate signature is invalid');
  }

  const payload = parseObject(Buffer.from(enc, 'base64').toString('utf8'));
  const meta = objectValue(payload, 'meta');
  const data = objectValue(payload, 'data');
  const issued = stringValue(meta, 'issued');
  const expiry = stringValue(meta, 'expiry');
  const now = input.now ?? new Date();
  assertTimeWindow(issued, expiry, now, input.allowExpired === true);

  if (stringValue(data, 'type') !== 'machines') {
    throw new Error('Certificate does not contain a machine resource');
  }

  const attributes = objectValue(data, 'attributes');
  const fingerprint = stringValue(attributes, 'fingerprint');
  if (fingerprint !== input.expectedFingerprint) {
    throw new Error('Machine certificate belongs to another deployment');
  }

  const relationships = objectValue(data, 'relationships');
  const accountId = relationshipId(relationships, 'account');
  const licenseId = relationshipId(relationships, 'license');
  if (accountId !== input.identity.accountId) {
    throw new Error('Machine certificate belongs to another Keygen account');
  }

  const included = Array.isArray(payload['included']) ? payload['included'] : [];
  const license = included.find((item) => {
    if (!item || typeof item !== 'object') return false;
    const resource = item as Record<string, unknown>;
    return resource['type'] === 'licenses' && resource['id'] === licenseId;
  });
  if (!license || typeof license !== 'object') {
    throw new Error('Machine certificate is missing its license snapshot');
  }

  const licenseResource = license as Record<string, unknown>;
  const licenseRelationships = objectValue(licenseResource, 'relationships');
  if (relationshipId(licenseRelationships, 'product') !== input.identity.productId) {
    throw new Error('Machine certificate is not for CloudPDF Self-hosted');
  }

  const licenseAttributes = objectValue(licenseResource, 'attributes');
  const status = optionalString(licenseAttributes['status'])?.toUpperCase();
  if (status === 'SUSPENDED' || status === 'BANNED' || status === 'EXPIRED') {
    throw new Error(`Machine certificate contains a ${status.toLowerCase()} license`);
  }

  const licenseExpiry = optionalString(licenseAttributes['expiry']);
  if (licenseExpiry) {
    const licenseExpiresAt = new Date(licenseExpiry).getTime();
    const issuedAt = new Date(issued).getTime();
    if (!Number.isFinite(licenseExpiresAt) || licenseExpiresAt < issuedAt) {
      throw new Error('The license embedded in the machine certificate has invalid expiry');
    }
    if (!input.allowExpired && licenseExpiresAt < now.getTime()) {
      throw new Error('The license embedded in the machine certificate has expired');
    }
  }

  return {
    artifactExpiresAt: expiry,
    artifactIssuedAt: issued,
    fingerprint,
    licenseExpiresAt: licenseExpiry ?? null,
    licenseId,
    metadata: isObject(licenseAttributes['metadata']) ? licenseAttributes['metadata'] : {},
    rawPayload: payload,
  };
}

function stripCertificate(certificate: string): string {
  const trimmed = certificate.trim();
  if (!trimmed.startsWith(begin) || !trimmed.endsWith(end)) {
    throw new Error('Machine certificate has an invalid envelope');
  }
  return trimmed.slice(begin.length, -end.length).replace(/\s+/g, '');
}

function assertTimeWindow(issued: string, expiry: string, now: Date, allowExpired: boolean): void {
  const issuedAt = new Date(issued).getTime();
  const expiresAt = new Date(expiry).getTime();
  if (!Number.isFinite(issuedAt) || !Number.isFinite(expiresAt)) {
    throw new Error('Machine certificate has invalid timestamps');
  }
  if (expiresAt < issuedAt) throw new Error('Machine certificate has an invalid time window');
  if (issuedAt > now.getTime() + 5 * 60 * 1_000) {
    throw new Error('Machine certificate was issued in the future');
  }
  if (!allowExpired && expiresAt < now.getTime()) {
    throw new Error('Machine certificate has expired');
  }
}

function relationshipId(relationships: Record<string, unknown>, name: string): string {
  const relationship = objectValue(relationships, name);
  const data = objectValue(relationship, 'data');
  return stringValue(data, 'id');
}

function parseObject(value: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Machine certificate contains invalid JSON');
  }
  if (!isObject(parsed)) throw new Error('Machine certificate payload is invalid');
  return parsed;
}

function objectValue(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const result = value[key];
  if (!isObject(result)) throw new Error(`Machine certificate is missing ${key}`);
  return result;
}

function stringValue(value: Record<string, unknown>, key: string): string {
  const result = value[key];
  if (typeof result !== 'string' || result.length === 0) {
    throw new Error(`Machine certificate is missing ${key}`);
  }
  return result;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
