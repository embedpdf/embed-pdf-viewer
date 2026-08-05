export type {
  SecretEncoding,
  SecretRef,
  SecretValue,
  SecretsProvider,
  SecretsProviderInfo,
} from './secrets/SecretsProvider';
export { SecretNotFound, SecretProviderUnreachable } from './secrets/SecretsProvider';
export { CachingSecretsProvider } from './secrets/CachingSecretsProvider';
export { EnvSecretsProvider } from './secrets/adapters/EnvSecretsProvider';
export { FileSecretsProvider } from './secrets/adapters/FileSecretsProvider';
export { AwsSecretsManagerProvider } from './secrets/adapters/AwsSecretsManagerProvider';
export { GcpSecretManagerProvider } from './secrets/adapters/GcpSecretManagerProvider';
export { AzureKeyVaultSecretsProvider } from './secrets/adapters/AzureKeyVaultSecretsProvider';
export {
  createSecretsProvider,
  createSecretsProviderRegistry,
  type SecretsProviderRegistry,
} from './secrets/createSecretsProvider';
export type {
  ResolvedSecret,
  ResolvedSecretMap,
  SecretResolveRequest,
  SecretResolver,
} from './secrets/SecretResolver';
export {
  createSecretResolver,
  resolveSecretRequest,
  resolveSecretRequests,
} from './secrets/SecretResolver';

export type {
  DataKey,
  KmsKeyring,
  KmsKeyringInfo,
  KmsProviderId,
  WrappedDataKey,
} from './kms/KmsKeyring';
export { KmsAadMismatch, KmsUnreachable } from './kms/KmsKeyring';
export { LocalAesGcmEnvelope, type LocalAesGcmCiphertext } from './kms/LocalAesGcmEnvelope';
export {
  decryptPasswordSession,
  encryptPasswordSession,
  passwordSessionKmsAad,
  signPasswordGrant,
  verifyPasswordGrant,
  type EncryptedPasswordSession,
  type PasswordSessionBinding,
  type PasswordSessionEnvelopeInput,
  type PasswordSessionOpenInput,
  type PasswordSessionServerSecret,
} from './password-session';
export { StaticKmsKeyring } from './kms/adapters/StaticKmsKeyring';
export { AwsKmsKeyring } from './kms/adapters/AwsKmsKeyring';
export { GcpKmsKeyring } from './kms/adapters/GcpKmsKeyring';
export { AzureKeyVaultKeyring } from './kms/adapters/AzureKeyVaultKeyring';
export { createKmsKeyring } from './kms/createKmsKeyring';

// SecretRef lives in the shared `config/secrets/` location because
// every adapter family's config schema needs it. Re-exported here for
// backward-compat with the historical import path.
export {
  SecretEncodingSchema,
  SecretRefSchema,
  type SecretRefConfig,
} from '../config/secrets/SecretRef';

// Family-local schema: SecretProviderConfig lives in
// `security/secrets/config/SecretsConfigSchema.ts`. Re-exported here
// for back-compat with the historical import path.
export {
  SecretProviderConfigSchema,
  SecretsConfigSchema,
  type SecretProviderConfig,
  type SecretsConfig,
} from './secrets/config/SecretsConfigSchema';
export { loadSecretsConfigFromEnv } from './secrets/config/loadSecretsConfigFromEnv';

export { KmsConfigSchema, type KmsConfig } from './kms/config/KmsConfigSchema';
export { loadKmsConfigFromEnv } from './kms/config/loadKmsConfigFromEnv';

// Shared SecretRef URI parser (used by env loaders across families)
export { parseSecretRefUri } from '../config/secrets/parseSecretRefUri';
