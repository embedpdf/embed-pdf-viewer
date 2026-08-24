/**
 * Factory for ObjectStore instances. Matches the unified adapter
 * pattern (see ADAPTERS.md) — switch on `config.kind`, accept a
 * SecretResolver via `opts.resolver` for SecretRef-bearing variants
 * (none of today's storage variants need it; the param is reserved
 * for future credential-via-SecretRef configurations).
 *
 * Returns synchronously today because no current adapter needs
 * async construction. Signature is `async` so future adapters (e.g.,
 * any kind that needs to resolve a SecretRef at construction) fit
 * without a breaking change.
 */

import { isSecretRefShape } from '../config/secrets/redact';
import type { SecretRef } from '../security/secrets/SecretsProvider';
import type { SecretResolver } from '../security/secrets/SecretResolver';
import type { ObjectStoreConfig } from './config/ObjectStoreConfigSchema';
import type { ObjectStore } from './ObjectStore';
import { FsObjectStore } from './adapters/FsObjectStore';
import { S3ObjectStore } from './adapters/S3ObjectStore';
import { GcsObjectStore } from './adapters/GcsObjectStore';
import { AzureBlobObjectStore } from './adapters/AzureBlobObjectStore';

export interface CreateObjectStoreOptions {
  /**
   * Required when a config carries a `SecretRef` field. Today only the
   * `azure-blob` adapter's optional `accountKey` can be a SecretRef
   * (the keyed-SAS fallback); `fs`/`s3`/`gcs` get credentials from the
   * SDK's own env/role chain and never need the resolver.
   */
  resolver?: SecretResolver;
}

export async function createObjectStore(
  config: ObjectStoreConfig,
  opts: CreateObjectStoreOptions = {},
): Promise<ObjectStore> {
  switch (config.kind) {
    case 'fs':
      return new FsObjectStore({ root: config.root });
    case 's3':
      return new S3ObjectStore({
        bucket: config.bucket,
        region: config.region,
        endpoint: config.endpoint,
      });
    case 'gcs':
      return new GcsObjectStore({
        bucket: config.bucket,
        ...(config.projectId ? { projectId: config.projectId } : {}),
      });
    case 'azure-blob': {
      // Resolve the optional account key (keyed-SAS fallback). Absent →
      // the adapter signs keyless user-delegation SAS via managed identity.
      const accountKey = config.accountKey
        ? await resolveStringSecret(config.accountKey, 'azure-blob.accountKey', opts)
        : undefined;
      return new AzureBlobObjectStore({
        container: config.container,
        accountName: config.accountName,
        ...(config.endpoint ? { endpoint: config.endpoint } : {}),
        ...(accountKey ? { accountKey } : {}),
      });
    }
  }
}

/**
 * Resolve a `string | SecretRef` field to a literal string. Plain
 * strings pass through; SecretRefs go through the injected resolver.
 * Mirrors `createCdnSigner`'s helper so secret handling is uniform
 * across adapter families.
 */
async function resolveStringSecret(
  value: unknown,
  fieldPath: string,
  opts: CreateObjectStoreOptions,
): Promise<string> {
  if (typeof value === 'string') return value;
  if (isSecretRefShape(value)) {
    if (!opts.resolver) {
      throw new Error(
        `${fieldPath} is a SecretRef but createObjectStore was called without opts.resolver`,
      );
    }
    const out = await opts.resolver.resolve({
      v: { ref: value as SecretRef, as: 'string' as const },
    });
    return out.v;
  }
  throw new Error(`${fieldPath} must be a string or a SecretRef`);
}
