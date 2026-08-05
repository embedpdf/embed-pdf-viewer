export type SecretEncoding = 'raw' | 'utf8' | 'base64' | 'hex';

export interface SecretRef {
  readonly provider: string;
  readonly name: string;
  readonly jsonKey?: string;
  readonly encoding?: SecretEncoding;
  readonly version?: string;
  readonly versionStage?: string;
}

export interface SecretValue {
  readonly bytes: Buffer;
  readonly version?: string;
  readonly fetchedAt: Date;
}

/**
 * Diagnostic identity for a SecretsProvider. `kind` is the discriminator
 * (matches the Zod config schema); other fields are public identifiers
 * that may be surfaced via `/v1/admin/status` and similar — bucket
 * names, hostnames, project IDs, etc. NEVER include secret values.
 *
 * Decorator providers (e.g., `CachingSecretsProvider`) add fields like
 * `cached: true` rather than mutating `kind`.
 */
export interface SecretsProviderInfo {
  readonly kind: string;
  readonly cached?: boolean;
  readonly [field: string]: unknown;
}

export interface SecretsProvider {
  readonly info: SecretsProviderInfo;
  get(ref: SecretRef): Promise<SecretValue>;
  invalidate(ref: SecretRef): void;
}

export class SecretNotFound extends Error {
  constructor(ref: SecretRef, providerKind: string) {
    super(`secret not found: provider=${ref.provider} kind=${providerKind} name=${ref.name}`);
    this.name = 'SecretNotFound';
  }
}

export class SecretProviderUnreachable extends Error {
  constructor(providerKind: string, cause: unknown) {
    super(`secret provider unreachable: kind=${providerKind}`);
    this.name = 'SecretProviderUnreachable';
    this.cause = cause;
  }
}

export function decodeSecretBytes(raw: Buffer, ref: SecretRef): Buffer {
  const extracted = ref.jsonKey ? extractJsonKey(raw, ref) : raw;
  const encoding = ref.encoding ?? 'raw';
  if (encoding === 'raw') return Buffer.from(extracted);
  const text = extracted.toString('utf8');
  if (encoding === 'utf8') return Buffer.from(text, 'utf8');
  return Buffer.from(text.trim(), encoding);
}

function extractJsonKey(raw: Buffer, ref: SecretRef): Buffer {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (cause) {
    throw new Error(`secret ${ref.name} jsonKey=${ref.jsonKey} requires a JSON object`, {
      cause,
    });
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`secret ${ref.name} jsonKey=${ref.jsonKey} requires a JSON object`);
  }
  const value = (parsed as Record<string, unknown>)[ref.jsonKey!];
  if (typeof value !== 'string') {
    throw new Error(`secret ${ref.name} jsonKey=${ref.jsonKey} must resolve to a string`);
  }
  return Buffer.from(value, 'utf8');
}
