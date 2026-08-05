/**
 * Family-local config schema for the KMS adapter family.
 *
 * Variants:
 *   - static  : in-process AES-256-GCM with a 32-byte KEK from secrets
 *   - aws-kms : AWS KMS via @aws-sdk/client-kms
 *   - gcp-kms : GCP Cloud KMS via @google-cloud/kms
 *   - azure-kv: Azure Key Vault via @azure/keyvault-keys
 *
 * The `static` variant carries a `kek: SecretRef` — the actual KEK
 * bytes are resolved by `createKmsKeyring` at construction via the
 * `{ resolver }` opt.
 */

import { z } from 'zod';

import { SecretRefSchema } from '../../../config/secrets/SecretRef';

export const KmsConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('static'),
    keyId: z.string().min(1).default('static-dev'),
    kek: SecretRefSchema,
  }),
  z.object({
    kind: z.literal('aws-kms'),
    keyId: z.string().min(1),
    region: z.string().min(1),
    endpoint: z.string().url().optional(),
  }),
  z.object({
    kind: z.literal('gcp-kms'),
    keyId: z.string().min(1),
  }),
  z.object({
    kind: z.literal('azure-kv'),
    vaultUrl: z.string().url(),
    keyName: z.string().min(1),
    keyVersion: z.string().min(1).optional(),
    mode: z.enum(['managed-hsm-a256gcm', 'key-vault-rsa-oaep-256']).optional(),
  }),
]);

export type KmsConfig = z.infer<typeof KmsConfigSchema>;
