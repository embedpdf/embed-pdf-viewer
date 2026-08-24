import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { canonicalAad, KmsAadMismatch, type KmsKeyring, type WrappedDataKey } from './KmsKeyring';

export interface LocalAesGcmCiphertext {
  readonly version: 1;
  readonly algorithm: 'AES_256_GCM';
  readonly wrappedDataKey: WrappedDataKey;
  readonly nonce: Buffer;
  readonly ciphertext: Buffer;
  readonly authTag: Buffer;
}

export class LocalAesGcmEnvelope {
  static async encrypt(
    payload: Buffer,
    keyring: KmsKeyring,
    aad?: Record<string, string>,
  ): Promise<LocalAesGcmCiphertext> {
    const dataKey = await keyring.generateDataKey(aad);
    try {
      const nonce = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', dataKey.plaintext, nonce);
      cipher.setAAD(canonicalAad(aad));
      const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
      return {
        version: 1,
        algorithm: 'AES_256_GCM',
        wrappedDataKey: dataKey.wrapped,
        nonce,
        ciphertext,
        authTag: cipher.getAuthTag(),
      };
    } finally {
      dataKey.plaintext.fill(0);
    }
  }

  static async decrypt(
    blob: LocalAesGcmCiphertext,
    keyring: KmsKeyring,
    aad?: Record<string, string>,
  ): Promise<Buffer> {
    if (blob.version !== 1 || blob.algorithm !== 'AES_256_GCM') {
      throw new KmsAadMismatch();
    }
    const dataKey = await keyring.decryptDataKey(blob.wrappedDataKey, aad);
    try {
      const decipher = createDecipheriv('aes-256-gcm', dataKey, blob.nonce);
      decipher.setAAD(canonicalAad(aad));
      decipher.setAuthTag(blob.authTag);
      return Buffer.concat([decipher.update(blob.ciphertext), decipher.final()]);
    } catch {
      throw new KmsAadMismatch();
    } finally {
      dataKey.fill(0);
    }
  }
}
