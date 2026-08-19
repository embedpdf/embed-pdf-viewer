/**
 * Family-local policy schema for the import (server-side pull) family.
 *
 * Defaults are the safe-for-hosted posture: enabled, https-only,
 * public networks only, 128 MiB cap. Self-hosted deployments loosen
 * `allowHttp`/`allowPrivateNetworks` for MinIO / in-VPC object stores.
 * The size cap exists because v1 imports are SYNCHRONOUS — the
 * response is held open for the transfer, so the cap must keep the
 * worst-case pull comfortably inside proxy/idle timeouts.
 */
import { z } from 'zod';

export const ImportPolicySchema = z.object({
  /** Master switch. Disabled → `documents.importFrom` answers 403. */
  enabled: z.boolean().default(true),
  /** Hard per-document byte ceiling (declared AND enforced mid-stream). */
  maxBytes: z
    .number()
    .int()
    .min(1)
    .default(128 * 1024 * 1024),
  /** Total wall-clock budget for one import (open + transfer). */
  timeoutMs: z.number().int().min(1_000).default(120_000),
  /** Concurrent pulls across the process; excess queues FIFO. */
  maxConcurrent: z.number().int().min(1).default(4),
  /** Allow `http:` sources (dev / MinIO). Default: https only. */
  allowHttp: z.boolean().default(false),
  /** Allow sources resolving to private/loopback/link-local ranges. */
  allowPrivateNetworks: z.boolean().default(false),
});

export type ImportPolicy = z.infer<typeof ImportPolicySchema>;

export function defaultImportPolicy(): ImportPolicy {
  return ImportPolicySchema.parse({});
}
