/**
 * Build an ImportPolicy from environment variables.
 *
 * Convention:
 *   CLOUDPDF_IMPORT_ENABLED=0|1                 (default: 1)
 *   CLOUDPDF_IMPORT_MAX_BYTES=134217728         (default: 128 MiB)
 *   CLOUDPDF_IMPORT_TIMEOUT_MS=120000           (default: 120s)
 *   CLOUDPDF_IMPORT_MAX_CONCURRENT=4            (default: 4)
 *   CLOUDPDF_IMPORT_ALLOW_HTTP=1                (default: off — https only)
 *   CLOUDPDF_IMPORT_ALLOW_PRIVATE_NETWORKS=1    (default: off — public only)
 */
import { ImportPolicySchema, type ImportPolicy } from './ImportPolicySchema';

export function loadImportPolicyFromEnv(env: NodeJS.ProcessEnv = process.env): ImportPolicy {
  return ImportPolicySchema.parse({
    ...flag(env, 'CLOUDPDF_IMPORT_ENABLED', 'enabled'),
    ...int(env, 'CLOUDPDF_IMPORT_MAX_BYTES', 'maxBytes'),
    ...int(env, 'CLOUDPDF_IMPORT_TIMEOUT_MS', 'timeoutMs'),
    ...int(env, 'CLOUDPDF_IMPORT_MAX_CONCURRENT', 'maxConcurrent'),
    ...flag(env, 'CLOUDPDF_IMPORT_ALLOW_HTTP', 'allowHttp'),
    ...flag(env, 'CLOUDPDF_IMPORT_ALLOW_PRIVATE_NETWORKS', 'allowPrivateNetworks'),
  });
}

function flag(env: NodeJS.ProcessEnv, name: string, key: string): Record<string, boolean> {
  const raw = env[name];
  if (raw === undefined || raw === '') return {};
  return { [key]: raw === '1' || raw.toLowerCase() === 'true' };
}

function int(env: NodeJS.ProcessEnv, name: string, key: string): Record<string, number> {
  const raw = env[name];
  if (raw === undefined || raw === '') return {};
  const n = Number(raw);
  if (!Number.isFinite(n)) throw new Error(`${name} must be a number (got ${raw})`);
  return { [key]: n };
}
