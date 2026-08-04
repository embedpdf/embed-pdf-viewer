import type { CloudPdfLicenseIdentity } from './product';

export interface ConnectedValidation {
  code: string;
  expiresAt: string | null;
  licenseId: string;
  metadata: Record<string, unknown>;
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

  return {
    code: validation.code,
    expiresAt: validation.expiresAt,
    licenseId: validation.licenseId,
    metadata: validation.metadata,
    valid: true,
  };
}

interface ValidationResult {
  code: string;
  detail?: string;
  expiresAt: string | null;
  licenseId: string;
  metadata: Record<string, unknown>;
  valid: boolean;
}

async function validate(input: {
  fingerprint: string;
  identity: CloudPdfLicenseIdentity;
  key: string;
}): Promise<ValidationResult> {
  const body = await request(input.identity, '/licenses/actions/validate-key', {
    body: JSON.stringify({
      meta: {
        key: input.key,
        scope: {
          fingerprint: input.fingerprint,
          product: input.identity.productId,
        },
      },
    }),
    method: 'POST',
  });
  const meta = asObject(body['meta']);
  const data = asObject(body['data']);
  const attributes = asObject(data['attributes']);
  const licenseId = asString(data['id'], 'license id');
  const code = asString(meta['code'], 'validation code');
  return {
    code,
    ...(typeof meta['detail'] === 'string' ? { detail: meta['detail'] } : {}),
    expiresAt: typeof attributes['expiry'] === 'string' ? attributes['expiry'] : null,
    licenseId,
    metadata: isObject(attributes['metadata']) ? attributes['metadata'] : {},
    valid: meta['valid'] === true,
  };
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
    await request(
      input.identity,
      '/machines',
      {
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
      },
    );
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
): Promise<Record<string, unknown>> {
  const delays = [0, 150, 500];
  let lastError: unknown;
  for (const waitMs of delays) {
    if (waitMs > 0) await delay(waitMs);
    try {
      const response = await fetch(
        `${identity.apiUrl}/v1/accounts/${encodeURIComponent(identity.accountId)}${path}`,
        {
          ...init,
          headers: {
            Accept: 'application/vnd.api+json',
            'Content-Type': 'application/vnd.api+json',
            ...(identity.environment ? { 'Keygen-Environment': identity.environment } : {}),
            ...init.headers,
          },
          signal: AbortSignal.timeout(10_000),
        },
      );
      const parsed = await response.json().catch(() => null);
      if (!response.ok) {
        const details = isObject(parsed) && Array.isArray(parsed['errors'])
          ? parsed['errors'][0]
          : undefined;
        const message = isObject(details) && typeof details['detail'] === 'string'
          ? details['detail']
          : `Keygen returned HTTP ${response.status}`;
        throw new ConnectedLicenseError(
          message,
          `HTTP_${response.status}`,
          response.status === 408 || response.status === 429 || response.status >= 500,
        );
      }
      if (!isObject(parsed)) throw new Error('Keygen returned an invalid response');
      return parsed;
    } catch (error) {
      const normalized = error instanceof ConnectedLicenseError
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

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function asObject(value: unknown): Record<string, unknown> {
  if (!isObject(value)) throw new ConnectedLicenseError('Keygen response is invalid', 'INVALID_RESPONSE', true);
  return value;
}

function asString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) {
    throw new ConnectedLicenseError(`Keygen response is missing ${name}`, 'INVALID_RESPONSE', true);
  }
  return value;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}
