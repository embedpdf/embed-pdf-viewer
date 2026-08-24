/**
 * Factory for KmsKeyring instances. Matches the unified adapter
 * pattern (see ADAPTERS.md) — switch on `config.kind`, accept a
 * SecretResolver via `opts.resolver` for SecretRef-bearing variants.
 *
 * The `static` kind needs its KEK bytes at construction time (held
 * in process). When called with a `static` config, this function
 * resolves the `kek` SecretRef through the supplied resolver before
 * instantiating the keyring. Cloud kinds use the cloud's native auth
 * — no resolver needed.
 */

import type { SecretResolver } from '../secrets/SecretResolver';
import type { KmsConfig } from './config/KmsConfigSchema';
import type { KmsKeyring } from './KmsKeyring';
import { StaticKmsKeyring } from './adapters/StaticKmsKeyring';
import { AwsKmsKeyring } from './adapters/AwsKmsKeyring';
import { GcpKmsKeyring } from './adapters/GcpKmsKeyring';
import { AzureKeyVaultKeyring } from './adapters/AzureKeyVaultKeyring';

export interface CreateKmsKeyringOptions {
  /**
   * Required for `static` KMS (used to resolve the KEK SecretRef).
   * Ignored by cloud kinds, which authenticate via the cloud's SDK.
   */
  resolver?: SecretResolver;
}

export async function createKmsKeyring(
  config: KmsConfig,
  opts: CreateKmsKeyringOptions = {},
): Promise<KmsKeyring> {
  switch (config.kind) {
    case 'static': {
      if (!opts.resolver) {
        throw new Error(
          'static KMS requires opts.resolver to resolve its KEK from a SecretsProvider',
        );
      }
      const resolved = await opts.resolver.resolve({
        kek: { ref: config.kek, as: 'buffer' },
      });
      return new StaticKmsKeyring({ keyId: config.keyId, kek: resolved.kek });
    }
    case 'aws-kms':
      return new AwsKmsKeyring({
        keyId: config.keyId,
        region: config.region,
        endpoint: config.endpoint,
      });
    case 'gcp-kms':
      return new GcpKmsKeyring({ keyId: config.keyId });
    case 'azure-kv':
      return new AzureKeyVaultKeyring({
        vaultUrl: config.vaultUrl,
        keyName: config.keyName,
        keyVersion: config.keyVersion,
        mode: config.mode,
      });
  }
}
