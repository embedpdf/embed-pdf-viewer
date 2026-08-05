/**
 * Parse a `secret://<provider>/<name>?jsonKey=&encoding=&version=&versionStage=`
 * URI into a SecretRef.
 *
 * The URI form is the canonical shorthand for SecretRef values in env-
 * driven configs. Every adapter family's env loader uses this to
 * accept secret-bearing fields as either a literal string (used as-is)
 * or a secret://… URI (resolved through the SecretsProvider).
 *
 * Examples:
 *   secret://env/CLOUDPDF_DEV_KEK?encoding=base64
 *   secret://awsProd/cloudpdf/prod/kek?encoding=base64
 *   secret://awsProd/cloudpdf/s3-creds?jsonKey=accessKeyId
 *   secret://gcpProd/projects/123/secrets/foo/versions/latest
 *
 * The `<name>` portion may contain `/` (everything after the first
 * `/` is the name, up to the `?` query string).
 */

import { SecretRefSchema, type SecretRefConfig } from './SecretRef';

export function parseSecretRefUri(uri: string): SecretRefConfig {
  if (!uri.startsWith('secret://')) {
    throw new Error(`secret URI must start with "secret://" (got: ${truncate(uri)})`);
  }
  const withoutScheme = uri.slice('secret://'.length);
  const queryIdx = withoutScheme.indexOf('?');
  const beforeQuery = queryIdx === -1 ? withoutScheme : withoutScheme.slice(0, queryIdx);
  const queryStr = queryIdx === -1 ? '' : withoutScheme.slice(queryIdx + 1);

  const slashIdx = beforeQuery.indexOf('/');
  if (slashIdx === -1) {
    throw new Error(`secret URI must have "provider/name" shape (got: ${truncate(uri)})`);
  }
  const provider = beforeQuery.slice(0, slashIdx);
  const name = beforeQuery.slice(slashIdx + 1);
  if (!provider || !name) {
    throw new Error(`secret URI must have both provider and name (got: ${truncate(uri)})`);
  }

  const params = new URLSearchParams(queryStr);
  const ref: Record<string, unknown> = { provider, name };
  const jsonKey = params.get('jsonKey');
  const encoding = params.get('encoding');
  const version = params.get('version');
  const versionStage = params.get('versionStage');
  if (jsonKey) ref.jsonKey = jsonKey;
  if (encoding) ref.encoding = encoding;
  if (version) ref.version = version;
  if (versionStage) ref.versionStage = versionStage;

  return SecretRefSchema.parse(ref);
}

function truncate(s: string): string {
  return s.length > 80 ? `${s.slice(0, 77)}...` : s;
}
