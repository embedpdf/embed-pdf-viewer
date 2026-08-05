/**
 * Family-local config schema for the Secrets adapter family.
 *
 * Two layers:
 *   - SecretProviderConfigSchema: a single provider variant
 *     (one of env / file / aws-sm / gcp-sm / azure-kv).
 *   - SecretsConfigSchema: the full secrets section — a registry of
 *     named providers plus a cache TTL.
 *
 * Lives under `security/secrets/config/` (the family's own subfolder)
 * matching the unified adapter layout. The top-level shared
 * `SecretRefSchema` is imported from `config/secrets/SecretRef`.
 */

import { z } from 'zod';

import { SecretRefSchema } from '../../../config/secrets/SecretRef';

export const SecretProviderConfigSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('env') }),
  z.object({ kind: z.literal('file'), root: z.string().min(1) }),
  z.object({
    kind: z.literal('aws-sm'),
    region: z.string().min(1),
    endpoint: z.string().url().optional(),
  }),
  z.object({ kind: z.literal('gcp-sm'), project: z.string().min(1) }),
  z.object({ kind: z.literal('azure-kv'), vaultUrl: z.string().url() }),
]);

export type SecretProviderConfig = z.infer<typeof SecretProviderConfigSchema>;

/**
 * Full secrets-section config: a registry of named providers plus an
 * optional cache policy.
 *
 * `cache` is intentionally optional — omitting it means
 * `createSecretsProviderRegistry` returns RAW providers (no decoration).
 * Set `cache: { ttlSec }` to apply uniform TTL caching across every
 * provider. For per-provider caching policies or custom decorators,
 * skip the registry helper and compose providers manually with
 * `createSecretsProvider` + `CachingSecretsProvider`.
 *
 * `loadSecretsConfigFromEnv` defaults `cache.ttlSec` to 3600 so
 * env-driven deployments get caching by default.
 */
export const SecretsConfigSchema = z.object({
  providers: z.record(SecretProviderConfigSchema),
  cache: z
    .object({
      ttlSec: z.number().int().positive(),
    })
    .optional(),
});

export type SecretsConfig = z.infer<typeof SecretsConfigSchema>;

// Re-export the shared SecretRefSchema so callers that import it
// alongside the secrets config can do it from one place.
export { SecretRefSchema };
