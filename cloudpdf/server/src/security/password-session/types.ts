import type { KmsKeyring, WrappedDataKey } from '../kms/KmsKeyring';
import type { PASSWORD_SESSION_CRYPTO_VERSION } from './constants';

export interface PasswordSessionBinding {
  tenantId: string;
  docId: string;
  layerName: string;
  sub: string;
  jwtJti: string;
  baseSha: string;
  securityFingerprint: string;
}

export interface PasswordSessionServerSecret {
  id: string;
  secret: string | Buffer;
}

export interface EncryptedPasswordSession {
  cryptoVersion: typeof PASSWORD_SESSION_CRYPTO_VERSION;
  serverSecretId: string;
  kmsProviderId: WrappedDataKey['providerId'];
  kmsKeyId: string;
  wrappedDataKey: Buffer;
  rowSalt: Buffer;
  nonce: Buffer;
  ciphertext: Buffer;
  authTag: Buffer;
}

export interface PasswordSessionEnvelopeInput {
  password: string;
  unlockKey: string;
  binding: PasswordSessionBinding;
  serverSecret: PasswordSessionServerSecret;
  keyring: KmsKeyring;
}

export interface PasswordSessionOpenInput {
  encrypted: EncryptedPasswordSession;
  unlockKey: string;
  binding: PasswordSessionBinding;
  serverSecret: PasswordSessionServerSecret;
  keyring: KmsKeyring;
}
