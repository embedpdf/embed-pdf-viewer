import { randomBytes } from 'node:crypto';
import {
  KmsAadMismatch,
  KmsUnreachable,
  canonicalAad,
  type DataKey,
  type KmsKeyring,
  type WrappedDataKey,
} from '../KmsKeyring';

export interface GcpKmsKeyringOptions {
  keyId: string;
}

type GcpKmsClient = {
  encrypt(input: {
    name: string;
    plaintext: Buffer;
    additionalAuthenticatedData?: Buffer;
  }): Promise<[{ ciphertext?: Uint8Array | string | null }, ...unknown[]]>;
  decrypt(input: {
    name: string;
    ciphertext: Buffer;
    additionalAuthenticatedData?: Buffer;
  }): Promise<[{ plaintext?: Uint8Array | string | null }, ...unknown[]]>;
};

type GcpKmsModule = {
  KeyManagementServiceClient: new () => GcpKmsClient;
};

export class GcpKmsKeyring implements KmsKeyring {
  readonly info: { kind: 'gcp-kms'; keyId: string };
  private readonly clientPromise: Promise<GcpKmsClient>;

  constructor(opts: GcpKmsKeyringOptions) {
    this.info = { kind: 'gcp-kms', keyId: opts.keyId };
    this.clientPromise = this.createClient();
  }

  async generateDataKey(aad?: Record<string, string>): Promise<DataKey> {
    const plaintext = randomBytes(32);
    try {
      const client = await this.clientPromise;
      const [res] = await client.encrypt({
        name: this.info.keyId,
        plaintext,
        additionalAuthenticatedData: gcpAad(aad),
      });
      const ciphertext = rawBytes(res.ciphertext);
      if (!ciphertext)
        throw new KmsUnreachable(new Error('GCP KMS encrypt returned no ciphertext'));
      return {
        plaintext,
        wrapped: {
          providerId: this.info.kind,
          keyId: this.info.keyId,
          algorithm: 'AES_256_GCM',
          version: 1,
          ciphertext,
        },
      };
    } catch (err) {
      plaintext.fill(0);
      if (err instanceof KmsUnreachable) throw err;
      throw new KmsUnreachable(err);
    }
  }

  async decryptDataKey(wrapped: WrappedDataKey, aad?: Record<string, string>): Promise<Buffer> {
    if (
      wrapped.providerId !== this.info.kind ||
      wrapped.keyId !== this.info.keyId ||
      wrapped.algorithm !== 'AES_256_GCM' ||
      wrapped.version !== 1
    ) {
      throw new KmsAadMismatch();
    }
    try {
      const client = await this.clientPromise;
      const [res] = await client.decrypt({
        name: this.info.keyId,
        ciphertext: wrapped.ciphertext,
        additionalAuthenticatedData: gcpAad(aad),
      });
      const plaintext = rawBytes(res.plaintext);
      if (!plaintext || plaintext.byteLength !== 32) throw new KmsAadMismatch();
      return plaintext;
    } catch (err) {
      if (err instanceof KmsAadMismatch) throw err;
      if (isGcpKmsAuthFailure(err)) throw new KmsAadMismatch();
      throw new KmsUnreachable(err);
    }
  }

  private async createClient(): Promise<GcpKmsClient> {
    const mod = (await import('@google-cloud/kms')) as unknown as GcpKmsModule;
    return new mod.KeyManagementServiceClient();
  }
}

function gcpAad(aad: Record<string, string> | undefined): Buffer | undefined {
  const canonical = canonicalAad(aad);
  return canonical.byteLength === 0 ? undefined : canonical;
}

function rawBytes(data: Uint8Array | string | null | undefined): Buffer | null {
  if (data == null) return null;
  if (typeof data === 'string') return Buffer.from(data, 'base64');
  return Buffer.from(data);
}

function isGcpKmsAuthFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 3 || code === 5 || code === 'INVALID_ARGUMENT' || code === 'NOT_FOUND';
}
