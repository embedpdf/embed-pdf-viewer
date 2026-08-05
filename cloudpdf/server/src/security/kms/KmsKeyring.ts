export type KmsProviderId = 'static' | 'aws-kms' | 'gcp-kms' | 'azure-kv';

/**
 * On-wire / persisted shape. `providerId` and `keyId` describe WHICH
 * keyring wrapped this data key — used at unwrap time to verify the
 * caller's current keyring is compatible.
 *
 * Field names are part of the persistence contract (stored in
 * `pdf_password_sessions.wrapped_data_key` and similar) — they don't
 * follow the runtime `info: { kind }` convention because they're not
 * a discriminator union, just an envelope.
 */
export interface WrappedDataKey {
  readonly providerId: KmsProviderId;
  readonly keyId: string;
  readonly algorithm: 'AES_256_GCM';
  readonly ciphertext: Buffer;
  readonly version: 1;
}

export interface DataKey {
  readonly plaintext: Buffer;
  readonly wrapped: WrappedDataKey;
}

/**
 * Diagnostic identity for a KmsKeyring. `kind` is the discriminator
 * (matches `KmsConfig.kind`); `keyId` is the runtime key identifier
 * (e.g., an AWS ARN, GCP resource name, Azure key URL, or static
 * label). Additional fields are public identifiers safe to expose via
 * `/v1/admin/status` — region, vault URL, etc. NEVER include secret
 * material.
 */
export interface KmsKeyringInfo {
  readonly kind: KmsProviderId;
  readonly keyId: string;
  readonly [field: string]: unknown;
}

export interface KmsKeyring {
  readonly info: KmsKeyringInfo;
  generateDataKey(aad?: Record<string, string>): Promise<DataKey>;
  decryptDataKey(wrapped: WrappedDataKey, aad?: Record<string, string>): Promise<Buffer>;
}

export class KmsAadMismatch extends Error {
  constructor() {
    super('KMS AAD mismatch or wrapped data key authentication failed');
    this.name = 'KmsAadMismatch';
  }
}

export class KmsUnreachable extends Error {
  constructor(cause: unknown) {
    super('KMS provider unreachable');
    this.name = 'KmsUnreachable';
    this.cause = cause;
  }
}

export function canonicalAad(aad: Record<string, string> | undefined): Buffer {
  if (!aad) return Buffer.alloc(0);
  const sorted = Object.keys(aad)
    .sort()
    .map((key) => [key, aad[key]] as const);
  return Buffer.from(JSON.stringify(sorted), 'utf8');
}
