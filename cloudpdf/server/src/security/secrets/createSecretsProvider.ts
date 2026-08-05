import { CachingSecretsProvider } from './CachingSecretsProvider';
import type { SecretsProvider } from './SecretsProvider';
import { EnvSecretsProvider } from './adapters/EnvSecretsProvider';
import { FileSecretsProvider } from './adapters/FileSecretsProvider';
import { AwsSecretsManagerProvider } from './adapters/AwsSecretsManagerProvider';
import { GcpSecretManagerProvider } from './adapters/GcpSecretManagerProvider';
import { AzureKeyVaultSecretsProvider } from './adapters/AzureKeyVaultSecretsProvider';
import type { SecretProviderConfig, SecretsConfig } from './config/SecretsConfigSchema';

export type SecretsProviderRegistry = ReadonlyMap<string, SecretsProvider>;

export interface CreateSecretsProviderOptions {
  env?: NodeJS.ProcessEnv;
}

/**
 * Build a single SecretsProvider instance for one config variant.
 * Lower-level primitive used by {@link createSecretsProviderRegistry}.
 * Useful when callers want full control over provider composition —
 * e.g., custom decorators (rate limiting, telemetry, per-provider
 * caching policies) or testing with mocked providers.
 */
export function createSecretsProvider(
  config: SecretProviderConfig,
  opts: CreateSecretsProviderOptions = {},
): SecretsProvider {
  switch (config.kind) {
    case 'env':
      return new EnvSecretsProvider(opts.env);
    case 'file':
      return new FileSecretsProvider({ root: config.root });
    case 'aws-sm':
      return new AwsSecretsManagerProvider({
        region: config.region,
        endpoint: config.endpoint,
      });
    case 'gcp-sm':
      return new GcpSecretManagerProvider({ project: config.project });
    case 'azure-kv':
      return new AzureKeyVaultSecretsProvider({ vaultUrl: config.vaultUrl });
  }
}

/**
 * Build the per-deployment SecretsProvider registry from a
 * `SecretsConfig`. Each named provider is constructed via
 * {@link createSecretsProvider}, then wrapped in
 * `CachingSecretsProvider` when the config carries a `cache` section.
 *
 * Caching behavior:
 *   - `config.cache: { ttlSec }` present → every provider wrapped in
 *     CachingSecretsProvider with that TTL.
 *   - `config.cache` absent → raw providers, no decoration. Use this
 *     when you want a fundamentally different caching policy (or none).
 *
 * For per-provider caching policies, custom decorators, or other
 * non-uniform composition, build providers manually via
 * `createSecretsProvider` and assemble the Map yourself.
 */
export function createSecretsProviderRegistry(
  config: SecretsConfig,
  opts: CreateSecretsProviderOptions = {},
): SecretsProviderRegistry {
  const ttlMs = config.cache ? config.cache.ttlSec * 1000 : undefined;
  const entries = Object.entries(config.providers).map(([id, providerConfig]) => {
    const raw = createSecretsProvider(providerConfig, opts);
    const wrapped = ttlMs !== undefined ? new CachingSecretsProvider(raw, { ttlMs }) : raw;
    return [id, wrapped] as const;
  });
  return new Map(entries);
}
