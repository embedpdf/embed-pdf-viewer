import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  canonicalAad,
  KmsAadMismatch,
  type DataKey,
  type KmsKeyring,
  type WrappedDataKey,
} from '../KmsKeyring';

export interface StaticKmsKeyringOptions {
  keyId: string;
  kek: Buffer;
}

export class StaticKmsKeyring implements KmsKeyring {
  readonly info: { kind: 'static'; keyId: string };
  private readonly kek: Buffer;

  constructor(opts: StaticKmsKeyringOptions) {
    if (opts.kek.byteLength !== 32) {
      throw new Error(
        `static KMS KEK must be 32 bytes after decoding (got ${opts.kek.byteLength})`,
      );
    }
    this.info = { kind: 'static', keyId: opts.keyId };
    this.kek = Buffer.from(opts.kek);
  }

  async generateDataKey(aad?: Record<string, string>): Promise<DataKey> {
    const plaintext = randomBytes(32);
    return {
      plaintext,
      wrapped: this.wrap(plaintext, aad),
    };
  }

  async decryptDataKey(wrapped: WrappedDataKey, aad?: Record<string, string>): Promise<Buffer> {
    if (wrapped.providerId !== this.info.kind || wrapped.keyId !== this.info.keyId) {
      throw new KmsAadMismatch();
    }
    if (wrapped.algorithm !== 'AES_256_GCM' || wrapped.version !== 1) {
      throw new KmsAadMismatch();
    }
    return this.unwrap(wrapped, aad);
  }

  private wrap(plaintext: Buffer, aad?: Record<string, string>): WrappedDataKey {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.kek, nonce);
    cipher.setAAD(canonicalAad(aad));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return {
      providerId: this.info.kind,
      keyId: this.info.keyId,
      algorithm: 'AES_256_GCM',
      version: 1,
      ciphertext: Buffer.concat([nonce, ciphertext, tag]),
    };
  }

  private unwrap(wrapped: WrappedDataKey, aad?: Record<string, string>): Buffer {
    const bytes = wrapped.ciphertext;
    if (bytes.byteLength < 12 + 16) throw new KmsAadMismatch();
    const nonce = bytes.subarray(0, 12);
    const tag = bytes.subarray(bytes.byteLength - 16);
    const ciphertext = bytes.subarray(12, bytes.byteLength - 16);
    try {
      const decipher = createDecipheriv('aes-256-gcm', this.kek, nonce);
      decipher.setAAD(canonicalAad(aad));
      decipher.setAuthTag(tag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } catch {
      throw new KmsAadMismatch();
    }
  }
}
