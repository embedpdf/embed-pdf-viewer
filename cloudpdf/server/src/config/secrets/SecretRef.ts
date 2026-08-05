/**
 * Shared SecretRef schema used by every adapter family's config.
 *
 * A `SecretRef` points at a secret stored in a registered
 * `SecretsProvider`. Adapter configs (KMS, Storage, CDN) embed
 * `SecretRef` fields for anything that must not appear as plaintext —
 * RSA keys, HMAC tokens, S3 credentials, KMS KEKs, etc. At
 * construction time, each adapter's factory resolves these via the
 * `SecretResolver` it's given.
 *
 * Lives in `config/secrets/` (not under any one family) because every
 * family's config schema imports it.
 */

import { z } from 'zod';

export const SecretEncodingSchema = z.enum(['raw', 'utf8', 'base64', 'hex']);

export const SecretRefSchema = z.object({
  provider: z.string().min(1),
  name: z.string().min(1),
  jsonKey: z.string().min(1).optional(),
  encoding: SecretEncodingSchema.optional(),
  version: z.string().min(1).optional(),
  versionStage: z.string().min(1).optional(),
});

export type SecretRefConfig = z.infer<typeof SecretRefSchema>;
