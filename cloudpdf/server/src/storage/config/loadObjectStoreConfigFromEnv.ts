/**
 * Build an ObjectStoreConfig from environment variables.
 *
 * Convention:
 *   CLOUDPDF_STORAGE_KIND=fs|s3|gcs|azure-blob   (default: fs)
 *
 *   # fs
 *   CLOUDPDF_STORAGE_FS_ROOT=./data/objects      (default)
 *
 *   # s3
 *   CLOUDPDF_STORAGE_S3_BUCKET=cloudpdf-prod
 *   CLOUDPDF_STORAGE_S3_REGION=us-east-1
 *   CLOUDPDF_STORAGE_S3_ENDPOINT=https://...      (optional, for S3-compatible)
 *
 *   # gcs (adapter ships in follow-up commit)
 *   CLOUDPDF_STORAGE_GCS_BUCKET=cloudpdf-prod
 *   CLOUDPDF_STORAGE_GCS_PROJECT_ID=...           (optional)
 *
 *   # azure-blob
 *   CLOUDPDF_STORAGE_AZURE_BLOB_CONTAINER=cloudpdf
 *   CLOUDPDF_STORAGE_AZURE_BLOB_ACCOUNT_NAME=cloudpdfprod
 *   CLOUDPDF_STORAGE_AZURE_BLOB_ENDPOINT=https://... (optional)
 *   CLOUDPDF_STORAGE_AZURE_BLOB_ACCOUNT_KEY=...      (optional; keyed-SAS
 *       fallback. Omit for keyless user-delegation SAS via managed identity.
 *       A `secret://` URI is parsed as a SecretRef; any other value is a
 *       literal key.)
 */

import { ObjectStoreConfigSchema, type ObjectStoreConfig } from './ObjectStoreConfigSchema';
import { parseSecretRefUri } from '../../config/secrets/parseSecretRefUri';

export function loadObjectStoreConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
): ObjectStoreConfig {
  const kind = (env['CLOUDPDF_STORAGE_KIND'] ?? 'fs').toLowerCase();
  switch (kind) {
    case 'fs': {
      const root = env['CLOUDPDF_STORAGE_FS_ROOT'] ?? './data/objects';
      return ObjectStoreConfigSchema.parse({ kind: 'fs', root });
    }
    case 's3': {
      const bucket = req(env, 'CLOUDPDF_STORAGE_S3_BUCKET');
      const region = req(env, 'CLOUDPDF_STORAGE_S3_REGION');
      const endpoint = env['CLOUDPDF_STORAGE_S3_ENDPOINT'];
      return ObjectStoreConfigSchema.parse({
        kind: 's3',
        bucket,
        region,
        ...(endpoint ? { endpoint } : {}),
      });
    }
    case 'gcs': {
      const bucket = req(env, 'CLOUDPDF_STORAGE_GCS_BUCKET');
      const projectId = env['CLOUDPDF_STORAGE_GCS_PROJECT_ID'];
      return ObjectStoreConfigSchema.parse({
        kind: 'gcs',
        bucket,
        ...(projectId ? { projectId } : {}),
      });
    }
    case 'azure-blob': {
      const container = req(env, 'CLOUDPDF_STORAGE_AZURE_BLOB_CONTAINER');
      const accountName = req(env, 'CLOUDPDF_STORAGE_AZURE_BLOB_ACCOUNT_NAME');
      const endpoint = env['CLOUDPDF_STORAGE_AZURE_BLOB_ENDPOINT'];
      const accountKeyRaw = env['CLOUDPDF_STORAGE_AZURE_BLOB_ACCOUNT_KEY'];
      const accountKey = accountKeyRaw
        ? accountKeyRaw.startsWith('secret://')
          ? parseSecretRefUri(accountKeyRaw)
          : accountKeyRaw
        : undefined;
      return ObjectStoreConfigSchema.parse({
        kind: 'azure-blob',
        container,
        accountName,
        ...(endpoint ? { endpoint } : {}),
        ...(accountKey ? { accountKey } : {}),
      });
    }
    default:
      throw new Error(
        `CLOUDPDF_STORAGE_KIND="${kind}" is not recognized (expected fs|s3|gcs|azure-blob)`,
      );
  }
}

function req(env: NodeJS.ProcessEnv, key: string): string {
  const value = env[key];
  if (!value) throw new Error(`${key} is required`);
  return value;
}
