/**
 * Build a SecretsConfig from environment variables.
 *
 * Convention:
 *   CLOUDPDF_SECRETS_PROVIDERS=env,file,awsProd,gcpProd,azureKv
 *      (comma-separated list of registry names; case-sensitive)
 *
 *   CLOUDPDF_SECRETS_PROVIDER_<NAME>_KIND=<kind>
 *   CLOUDPDF_SECRETS_PROVIDER_<NAME>_<FIELD>=<value>
 *      (per-provider configuration; <NAME> matches the registry name
 *      uppercased with non-alphanumeric chars replaced by '_')
 *
 *   CLOUDPDF_SECRETS_CACHE_TTL_SEC=3600
 *      (TTL for the CachingSecretsProvider decorator)
 *
 * When `CLOUDPDF_SECRETS_PROVIDERS` is unset, defaults to a single
 * `env` provider — matches today's `defaultEnvSecurityConfig`
 * behaviour for the secrets piece.
 *
 * Throws via the Zod schema if any required field is missing or
 * malformed, with the offending field path in the error message.
 */

import {
  SecretsConfigSchema,
  type SecretProviderConfig,
  type SecretsConfig,
} from './SecretsConfigSchema';

export function loadSecretsConfigFromEnv(env: NodeJS.ProcessEnv = process.env): SecretsConfig {
  const providersRaw = env['CLOUDPDF_SECRETS_PROVIDERS'];
  const usingDefault = !providersRaw || providersRaw.trim().length === 0;
  const providersList = parseProvidersList(providersRaw);
  const providers: Record<string, SecretProviderConfig> = {};
  for (const name of providersList) {
    // Zero-config default: a single `env` provider needs no per-provider
    // KIND var (matches this loader's documented contract). Explicitly
    // listed providers stay strict and must declare their kind.
    providers[name] = usingDefault && name === 'env' ? { kind: 'env' } : readProvider(env, name);
  }
  // Env-driven deployments get caching by default (1h). Programmatic
  // users who omit `cache` from a hand-built SecretsConfig get raw
  // providers (no decoration) — see SecretsConfigSchema docstring.
  // To explicitly disable caching via env, set
  // CLOUDPDF_SECRETS_CACHE_TTL_SEC=0 (parsed below; 0 → cache omitted).
  const ttlSecRaw = env['CLOUDPDF_SECRETS_CACHE_TTL_SEC'];
  const ttlSec = ttlSecRaw !== undefined ? Number(ttlSecRaw) : 3600;
  return SecretsConfigSchema.parse({
    providers,
    ...(ttlSec > 0 ? { cache: { ttlSec } } : {}),
  });
}

function parseProvidersList(raw: string | undefined): string[] {
  if (!raw || raw.trim().length === 0) return ['env']; // default single-provider env
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function readProvider(env: NodeJS.ProcessEnv, name: string): SecretProviderConfig {
  const prefix = `CLOUDPDF_SECRETS_PROVIDER_${envSlug(name)}_`;
  const kind = env[`${prefix}KIND`];
  if (!kind) {
    throw new Error(
      `secrets provider "${name}" missing kind (set ${prefix}KIND=env|file|aws-sm|gcp-sm|azure-kv)`,
    );
  }
  switch (kind) {
    case 'env':
      return { kind: 'env' };
    case 'file': {
      const root = env[`${prefix}ROOT`];
      if (!root) throw new Error(`secrets provider "${name}" (file) requires ${prefix}ROOT`);
      return { kind: 'file', root };
    }
    case 'aws-sm': {
      const region = env[`${prefix}REGION`];
      if (!region) throw new Error(`secrets provider "${name}" (aws-sm) requires ${prefix}REGION`);
      const endpoint = env[`${prefix}ENDPOINT`];
      return {
        kind: 'aws-sm',
        region,
        ...(endpoint ? { endpoint } : {}),
      };
    }
    case 'gcp-sm': {
      const project = env[`${prefix}PROJECT`];
      if (!project)
        throw new Error(`secrets provider "${name}" (gcp-sm) requires ${prefix}PROJECT`);
      return { kind: 'gcp-sm', project };
    }
    case 'azure-kv': {
      const vaultUrl = env[`${prefix}VAULT_URL`];
      if (!vaultUrl) {
        throw new Error(`secrets provider "${name}" (azure-kv) requires ${prefix}VAULT_URL`);
      }
      return { kind: 'azure-kv', vaultUrl };
    }
    default:
      throw new Error(
        `secrets provider "${name}" has unknown kind "${kind}" (expected env|file|aws-sm|gcp-sm|azure-kv)`,
      );
  }
}

/**
 * Normalize a registry name into the env-var slug. Example:
 *   "awsProd"      → "AWSPROD"
 *   "gcp-prod"     → "GCP_PROD"
 *   "azureKv01"    → "AZUREKV01"
 *
 * Stable across platforms; case-insensitive on lookup but expressed
 * as uppercase for readability.
 */
function envSlug(name: string): string {
  return name.replace(/[^a-zA-Z0-9]+/g, '_').toUpperCase();
}
