import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from 'node:crypto';
import { canonicalAad, KmsAadMismatch } from '../kms/KmsKeyring';
import {
  PASSWORD_SESSION_AEAD_AAD_MARKER,
  PASSWORD_SESSION_CRYPTO_VERSION,
  PASSWORD_SESSION_HKDF_AEAD_INFO,
  PASSWORD_SESSION_HKDF_WRAP_INFO,
  PASSWORD_SESSION_KMS_PURPOSE,
  PASSWORD_SESSION_KMS_VERSION,
} from './constants';
import type {
  EncryptedPasswordSession,
  PasswordSessionBinding,
  PasswordSessionEnvelopeInput,
  PasswordSessionOpenInput,
} from './types';

export async function encryptPasswordSession(
  input: PasswordSessionEnvelopeInput,
): Promise<EncryptedPasswordSession> {
  const rowSalt = randomBytes(32);
  const nonce = randomBytes(12);
  const kmsAad = passwordSessionKmsAad(input.binding);
  const dataKey = await input.keyring.generateDataKey(kmsAad);
  try {
    const finalKey = deriveFinalKey({
      unlockKey: input.unlockKey,
      serverSecret: input.serverSecret.secret,
      dataKey: dataKey.plaintext,
      rowSalt,
      binding: input.binding,
    });
    try {
      const cipher = createCipheriv('aes-256-gcm', finalKey, nonce);
      cipher.setAAD(canonicalAad(passwordSessionAeadAad(input.binding)));
      const ciphertext = Buffer.concat([
        cipher.update(Buffer.from(input.password, 'utf8')),
        cipher.final(),
      ]);
      return {
        cryptoVersion: PASSWORD_SESSION_CRYPTO_VERSION,
        serverSecretId: input.serverSecret.id,
        kmsProviderId: dataKey.wrapped.providerId,
        kmsKeyId: dataKey.wrapped.keyId,
        wrappedDataKey: dataKey.wrapped.ciphertext,
        rowSalt,
        nonce,
        ciphertext,
        authTag: cipher.getAuthTag(),
      };
    } finally {
      finalKey.fill(0);
    }
  } finally {
    dataKey.plaintext.fill(0);
  }
}

export async function decryptPasswordSession(input: PasswordSessionOpenInput): Promise<string> {
  if (input.encrypted.cryptoVersion !== PASSWORD_SESSION_CRYPTO_VERSION) {
    throw new KmsAadMismatch();
  }
  const dataKey = await input.keyring.decryptDataKey(
    {
      providerId: input.encrypted.kmsProviderId,
      keyId: input.encrypted.kmsKeyId,
      algorithm: 'AES_256_GCM',
      version: 1,
      ciphertext: input.encrypted.wrappedDataKey,
    },
    passwordSessionKmsAad(input.binding),
  );
  try {
    const finalKey = deriveFinalKey({
      unlockKey: input.unlockKey,
      serverSecret: input.serverSecret.secret,
      dataKey,
      rowSalt: input.encrypted.rowSalt,
      binding: input.binding,
    });
    try {
      const decipher = createDecipheriv('aes-256-gcm', finalKey, input.encrypted.nonce);
      decipher.setAAD(canonicalAad(passwordSessionAeadAad(input.binding)));
      decipher.setAuthTag(input.encrypted.authTag);
      return Buffer.concat([
        decipher.update(input.encrypted.ciphertext),
        decipher.final(),
      ]).toString('utf8');
    } finally {
      finalKey.fill(0);
    }
  } catch {
    throw new KmsAadMismatch();
  } finally {
    dataKey.fill(0);
  }
}

export function passwordSessionKmsAad(binding: PasswordSessionBinding): Record<string, string> {
  return {
    purpose: PASSWORD_SESSION_KMS_PURPOSE,
    version: PASSWORD_SESSION_KMS_VERSION,
    tenantId: binding.tenantId,
    docId: binding.docId,
    layerName: binding.layerName,
    sub: binding.sub,
    jwtJti: binding.jwtJti,
    baseSha: binding.baseSha,
    securityFingerprint: binding.securityFingerprint,
  };
}

function passwordSessionAeadAad(binding: PasswordSessionBinding): Record<string, string> {
  return {
    ...passwordSessionKmsAad(binding),
    aead: PASSWORD_SESSION_AEAD_AAD_MARKER,
  };
}

function deriveFinalKey(input: {
  unlockKey: string;
  serverSecret: string | Buffer;
  dataKey: Buffer;
  rowSalt: Buffer;
  binding: PasswordSessionBinding;
}): Buffer {
  const unlockIkm = createHmac('sha256', input.serverSecret).update(input.unlockKey).digest();
  try {
    const wrapKey = hkdfBuffer({
      ikm: unlockIkm,
      salt: input.rowSalt,
      info: `${PASSWORD_SESSION_HKDF_WRAP_INFO}|${bindingInfo(input.binding)}`,
      length: 32,
    });
    try {
      const combinedIkm = createHmac('sha256', wrapKey).update(input.dataKey).digest();
      try {
        return hkdfBuffer({
          ikm: combinedIkm,
          salt: input.rowSalt,
          info: `${PASSWORD_SESSION_HKDF_AEAD_INFO}|${bindingInfo(input.binding)}`,
          length: 32,
        });
      } finally {
        combinedIkm.fill(0);
      }
    } finally {
      wrapKey.fill(0);
    }
  } finally {
    unlockIkm.fill(0);
  }
}

function hkdfBuffer(input: { ikm: Buffer; salt: Buffer; info: string; length: number }): Buffer {
  return Buffer.from(hkdfSync('sha256', input.ikm, input.salt, input.info, input.length));
}

function bindingInfo(binding: PasswordSessionBinding): string {
  return [
    binding.tenantId,
    binding.docId,
    binding.layerName,
    binding.sub,
    binding.jwtJti,
    binding.baseSha,
    binding.securityFingerprint,
  ].join('|');
}
