/**
 * Family-local config schema for the Storage adapter family.
 *
 * Variants:
 *   - fs        : local filesystem (single-server / dev)
 *   - s3        : AWS S3 or S3-compatible endpoint (R2, MinIO, Wasabi, ...)
 *   - gcs       : Google Cloud Storage (keyless ADC; key-file via SDK chain)
 *   - azure-blob: Azure Blob Storage (keyless managed-identity SAS by
 *                 default; optional `accountKey` for account-key SAS)
 *
 * Credentials convention: `s3`/`gcs` rely on each cloud SDK's native
 * credential chain (IAM role / IRSA, ADC / Workload Identity, or the
 * standard env/key-file fallback) — nothing credential-shaped lives in
 * this schema for them. Only `azure-blob` carries an optional
 * `accountKey` because that's the one backend where we sign SAS tokens
 * ourselves and need the keyed fallback path.
 */

import { z } from 'zod';
import { SecretRefSchema } from '../../config/secrets/SecretRef';

export const ObjectStoreConfigSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('fs'),
    root: z.string().min(1),
  }),
  z.object({
    kind: z.literal('s3'),
    bucket: z.string().min(1),
    region: z.string().min(1),
    endpoint: z.string().url().optional(),
  }),
  z.object({
    kind: z.literal('gcs'),
    bucket: z.string().min(1),
    projectId: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal('azure-blob'),
    container: z.string().min(1),
    accountName: z.string().min(1),
    endpoint: z.string().url().optional(),
    /**
     * Optional storage account key for the KEYED presigning fallback.
     * When absent (the recommended default), the adapter signs SAS
     * tokens keylessly via a user-delegation key obtained through
     * `DefaultAzureCredential` (managed identity / Workload Identity).
     * When present, the adapter signs account-key SAS instead — for
     * environments that can't grant the AAD data-plane role or run
     * outside Azure. SecretRef in prod; plain string for local dev.
     */
    accountKey: z.union([SecretRefSchema, z.string().min(1)]).optional(),
  }),
]);

export type ObjectStoreConfig = z.infer<typeof ObjectStoreConfigSchema>;
