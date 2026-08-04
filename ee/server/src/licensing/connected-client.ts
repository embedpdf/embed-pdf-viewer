import { randomBytes } from 'node:crypto';

import {
  captureAndVerifyKeygenResponse,
  verifyKeygenResponseProof,
  type KeygenResponseProof,
} from './keygen-response';
import type { CloudPdfLicenseIdentity } from './product';

export interface ConnectedValidation {
  code: string;
  expiresAt: string | null;
  licenseId: string;
  metadata: Record<string, unknown>;
  proof: KeygenResponseProof;
  validatedAt: number;
  valid: true;
}

export class ConnectedLicenseError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = 'ConnectedLicenseError';
  }
}

export async function validateConnectedLicense(input: {
  fingerprint: string;
  identity: CloudPdfLicenseIdentity;
  key: string;
}): Promise<ConnectedValidation> {
  let validation = await validate(input);
  if (
    !validation.valid &&
    ['NO_MACHINE', 'NO_MACHINES', 'FINGERPRINT_SCOPE_MISMATCH'].includes(validation.code)
  ) {
    await activate(input, validation.licenseId);
    validation = await validate(input);
  }

  if (!validation.valid) {
    throw new ConnectedLicenseError(
      validation.detail ?? `CloudPDF license validation failed: ${validation.code}`,
      validation.code,
      false,
    );
  }

  return validation;
}

export function verifyCachedConnectedValidation(input: {
  fingerprint: string;
  identity: CloudPdfLicenseIdentity;
  key: string;
  proof: KeygenResponseProof;
}): ConnectedValidation {
  const url = requestUrl(input.identity, '/licenses/actions/validate-key');
  const verified = verifyKeygenResponseProof({
    identity: input.identity,
    method: 'POST',
    proof: input.proof,
    requestUrl: url,
    requireFreshDate: false,
  });
  const validation = parseValidation({
    body: verified.body,
    expectedFingerprint: input.fingerprint,
    expectedKey: input.key,
    identity: input.identity,
    proof: input.proof,
    validatedAt: verified.dateMs,
  });
  if (!validation.valid) {
    throw new Error('Cached Keygen proof does not contain a valid license decision');
  }
  return validation;
}

interface InvalidValidation {
  code: string;
  detail?: string;
  expiresAt: string | null;
  licenseId: string;
  metadata: Record<string, unknown>;
  proof: KeygenResponseProof;
  validatedAt: number;
  valid: false;
}

type ValidationResult = ConnectedValidation | InvalidValidation;

async function validate(input: {
  fingerprint: string;
  identity: CloudPdfLicenseIdentity;
  key: string;
}): Promise<ValidationResult> {
  const nonce = randomNonce();
  const response = await request(input.identity, '/licenses/actions/validate-key', {
    body: JSON.stringify({
      meta: {
        key: input.key,
        nonce,
        scope: {
          fingerprint: input.fingerprint,
          product: input.identity.productId,
        },
      },
    }),
    method: 'POST',
  });
  return parseValidation({
    body: response.body,
    expectedFingerprint: input.fingerprint,
    expectedKey: input.key,
    expectedNonce: nonce,
    identity: input.identity,
    proof: response.proof,
    validatedAt: response.validatedAt,
  });
}

function parseValidation(input: {
  body: Record<string, unknown>;
  expectedFingerprint: string;
  expectedKey: string;
  expectedNonce?: number;
  identity: CloudPdfLicenseIdentity;
  proof: KeygenResponseProof;
  validatedAt: number;
}): ValidationResult {
  const meta = asObject(input.body['meta']);
  const code = asString(meta['code'], 'validation code');
  const nonce = meta['nonce'];
  if (!Number.isSafeInteger(nonce)) {
    throw invalidResponse('Keygen response is missing its signed nonce');
  }
  if (input.expectedNonce !== undefined && nonce !== input.expectedNonce) {
    throw invalidResponse('Keygen response nonce does not match the request');
  }
  const scope = asObject(meta['scope']);
  if (
    scope['fingerprint'] !== input.expectedFingerprint ||
    scope['product'] !== input.identity.productId
  ) {
    throw invalidResponse('Keygen response scope does not match this deployment');
  }
  if (meta['valid'] !== true && meta['valid'] !== false) {
    throw invalidResponse('Keygen response is missing its validation decision');
  }

  // A lookup miss is a normal, signed validation denial and Keygen returns
  // data: null for it. Surface the signed code instead of misclassifying the
  // response as malformed. Activation-related denials include a license
  // resource and continue through the binding checks below.
  const responseData = input.body['data'];
  if (!isObject(responseData)) {
    if (meta['valid'] === false) {
      throw new ConnectedLicenseError(
        typeof meta['detail'] === 'string'
          ? meta['detail']
          : `CloudPDF license validation failed: ${code}`,
        code,
        false,
      );
    }
    throw invalidResponse('Keygen returned valid=true without a license resource');
  }

  const data = responseData;
  const attributes = asObject(data['attributes']);
  const relationships = asObject(data['relationships']);
  const licenseId = asString(data['id'], 'license id');
  if (attributes['key'] !== input.expectedKey) {
    throw invalidResponse('Keygen response is for another license key');
  }
  if (relationshipId(relationships, 'account') !== input.identity.accountId) {
    throw invalidResponse('Keygen response is for another account');
  }
  if (relationshipId(relationships, 'product') !== input.identity.productId) {
    throw invalidResponse('Keygen response is for another product');
  }
  const expiresAt = parseExpiry(attributes['expiry']);
  const common = {
    code,
    expiresAt,
    licenseId,
    metadata: isObject(attributes['metadata']) ? attributes['metadata'] : {},
    proof: input.proof,
    validatedAt: input.validatedAt,
  };
  if (meta['valid'] !== true) {
    return {
      ...common,
      ...(typeof meta['detail'] === 'string' ? { detail: meta['detail'] } : {}),
      valid: false,
    };
  }
  if (code !== 'VALID') {
    throw invalidResponse(`Keygen returned valid=true with the unexpected code ${code}`);
  }
  const status = asString(attributes['status'], 'license status').toUpperCase();
  if (status !== 'ACTIVE') {
    throw invalidResponse(`Keygen returned a ${status.toLowerCase()} license`);
  }
  if (expiresAt !== null && new Date(expiresAt).getTime() <= input.validatedAt) {
    throw invalidResponse('Keygen returned valid=true for an expired license');
  }
  return { ...common, valid: true };
}

async function activate(
  input: {
    fingerprint: string;
    identity: CloudPdfLicenseIdentity;
    key: string;
  },
  licenseId: string,
): Promise<void> {
  try {
    await request(input.identity, '/machines', {
      body: JSON.stringify({
        data: {
          attributes: {
            fingerprint: input.fingerprint,
            name: 'CloudPDF Self-hosted deployment',
            platform: `${process.platform}/${process.arch}`,
          },
          relationships: {
            license: { data: { id: licenseId, type: 'licenses' } },
          },
          type: 'machines',
        },
      }),
      headers: { Authorization: `License ${input.key}` },
      method: 'POST',
    });
  } catch (error) {
    // A previous activation request may have succeeded while its response was
    // lost. Validation immediately after this call is the reconciliation step.
    if (!(error instanceof ConnectedLicenseError) || error.code !== 'HTTP_409') {
      throw error;
    }
  }
}

async function request(
  identity: CloudPdfLicenseIdentity,
  path: string,
  init: RequestInit,
): Promise<{
  body: Record<string, unknown>;
  proof: KeygenResponseProof;
  validatedAt: number;
}> {
  const delays = [0, 150, 500];
  const url = requestUrl(identity, path);
  let lastError: unknown;
  for (const waitMs of delays) {
    if (waitMs > 0) await delay(waitMs);
    try {
      const response = await fetch(url, {
        ...init,
        headers: {
          Accept: 'application/vnd.api+json',
          'Content-Type': 'application/vnd.api+json',
          'Keygen-Accept-Signature': 'algorithm="ed25519"',
          ...(identity.environment ? { 'Keygen-Environment': identity.environment } : {}),
          ...init.headers,
        },
        redirect: 'error',
        signal: AbortSignal.timeout(10_000),
      });
      const rawBody = Buffer.from(await response.arrayBuffer());
      let parsedForError: unknown;
      try {
        parsedForError = JSON.parse(rawBody.toString('utf8'));
      } catch {
        parsedForError = null;
      }
      if (!response.ok) {
        const details =
          isObject(parsedForError) && Array.isArray(parsedForError['errors'])
            ? parsedForError['errors'][0]
            : undefined;
        const message =
          isObject(details) && typeof details['detail'] === 'string'
            ? details['detail']
            : `Keygen returned HTTP ${response.status}`;
        throw new ConnectedLicenseError(
          message,
          `HTTP_${response.status}`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      let verified: ReturnType<typeof captureAndVerifyKeygenResponse>;
      try {
        verified = captureAndVerifyKeygenResponse({
          body: rawBody,
          date: response.headers.get('date'),
          digest: response.headers.get('digest'),
          identity,
          keygenSignature: response.headers.get('keygen-signature'),
          method: init.method ?? 'GET',
          requestUrl: url,
        });
      } catch (error) {
        throw new ConnectedLicenseError(
          error instanceof Error ? error.message : 'Keygen response proof is invalid',
          'INVALID_RESPONSE',
          false,
        );
      }
      return {
        body: verified.verified.body,
        proof: verified.proof,
        validatedAt: verified.verified.dateMs,
      };
    } catch (error) {
      const normalized =
        error instanceof ConnectedLicenseError
          ? error
          : new ConnectedLicenseError(
              error instanceof Error ? error.message : 'Keygen request failed',
              'NETWORK_ERROR',
              true,
            );
      lastError = normalized;
      if (!normalized.retryable) throw normalized;
    }
  }
  throw lastError;
}

function requestUrl(identity: CloudPdfLicenseIdentity, path: string): URL {
  return new URL(
    `/v1/accounts/${encodeURIComponent(identity.accountId)}${path}`,
    `${identity.apiUrl}/`,
  );
}

function relationshipId(relationships: Record<string, unknown>, name: string): string {
  const relationship = asObject(relationships[name]);
  const data = asObject(relationship['data']);
  return asString(data['id'], `${name} relationship`);
}

function randomNonce(): number {
  return randomBytes(6).readUIntBE(0, 6);
}

function parseExpiry(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime())) {
    throw invalidResponse('Keygen response contains an invalid license expiry');
  }
  return value;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw invalidResponse('Keygen response is invalid');
  return value;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) {
    throw invalidResponse(`Keygen response is missing ${name}`);
  }
  return value;
}

function invalidResponse(message: string): ConnectedLicenseError {
  // A signed body that fails request/identity binding is not an availability
  // failure. Treating it as retryable would let a replay or malformed proof
  // enter the offline-grace path.
  return new ConnectedLicenseError(message, 'INVALID_RESPONSE', false);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
