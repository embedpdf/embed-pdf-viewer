import {
  KmsAadMismatch,
  KmsUnreachable,
  canonicalAad,
  type DataKey,
  type KmsKeyring,
  type WrappedDataKey,
} from '../KmsKeyring';

export interface AwsKmsKeyringOptions {
  keyId: string;
  region: string;
  endpoint?: string;
}

type AwsKmsClient = {
  send(command: unknown): Promise<{
    Plaintext?: Uint8Array;
    CiphertextBlob?: Uint8Array;
    KeyId?: string;
  }>;
};

type AwsKmsModule = {
  KMSClient: new (opts: { region: string; endpoint?: string }) => AwsKmsClient;
  GenerateDataKeyCommand: new (input: {
    KeyId: string;
    KeySpec: 'AES_256';
    EncryptionContext?: Record<string, string>;
  }) => unknown;
  DecryptCommand: new (input: {
    CiphertextBlob: Uint8Array;
    EncryptionContext?: Record<string, string>;
  }) => unknown;
};

export class AwsKmsKeyring implements KmsKeyring {
  readonly info: { kind: 'aws-kms'; keyId: string; region: string; endpoint?: string };
  private readonly clientPromise: Promise<{
    client: AwsKmsClient;
    GenerateDataKeyCommand: AwsKmsModule['GenerateDataKeyCommand'];
    DecryptCommand: AwsKmsModule['DecryptCommand'];
  }>;

  constructor(private readonly opts: AwsKmsKeyringOptions) {
    this.info = {
      kind: 'aws-kms',
      keyId: opts.keyId,
      region: opts.region,
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    };
    this.clientPromise = this.createClient();
  }

  async generateDataKey(aad?: Record<string, string>): Promise<DataKey> {
    try {
      const { client, GenerateDataKeyCommand } = await this.clientPromise;
      const res = await client.send(
        new GenerateDataKeyCommand({
          KeyId: this.info.keyId,
          KeySpec: 'AES_256',
          EncryptionContext: normalizeAwsAad(aad),
        }),
      );
      if (!res.Plaintext || !res.CiphertextBlob) {
        throw new KmsUnreachable(
          new Error('AWS KMS GenerateDataKey returned an incomplete response'),
        );
      }
      const plaintext = Buffer.from(res.Plaintext);
      if (plaintext.byteLength !== 32) {
        throw new KmsUnreachable(
          new Error(`AWS KMS GenerateDataKey returned ${plaintext.byteLength} bytes`),
        );
      }
      return {
        plaintext,
        wrapped: {
          providerId: this.info.kind,
          keyId: res.KeyId ?? this.info.keyId,
          algorithm: 'AES_256_GCM',
          version: 1,
          ciphertext: Buffer.from(res.CiphertextBlob),
        },
      };
    } catch (err) {
      if (err instanceof KmsUnreachable) throw err;
      throw new KmsUnreachable(err);
    }
  }

  async decryptDataKey(wrapped: WrappedDataKey, aad?: Record<string, string>): Promise<Buffer> {
    if (wrapped.providerId !== this.info.kind || wrapped.algorithm !== 'AES_256_GCM') {
      throw new KmsAadMismatch();
    }
    try {
      const { client, DecryptCommand } = await this.clientPromise;
      const res = await client.send(
        new DecryptCommand({
          CiphertextBlob: wrapped.ciphertext,
          EncryptionContext: normalizeAwsAad(aad),
        }),
      );
      if (!res.Plaintext) {
        throw new KmsAadMismatch();
      }
      const plaintext = Buffer.from(res.Plaintext);
      if (plaintext.byteLength !== 32) {
        throw new KmsAadMismatch();
      }
      return plaintext;
    } catch (err) {
      if (err instanceof KmsAadMismatch) throw err;
      if (isAwsKmsAuthFailure(err)) throw new KmsAadMismatch();
      throw new KmsUnreachable(err);
    }
  }

  private async createClient(): Promise<{
    client: AwsKmsClient;
    GenerateDataKeyCommand: AwsKmsModule['GenerateDataKeyCommand'];
    DecryptCommand: AwsKmsModule['DecryptCommand'];
  }> {
    const mod = (await import('@aws-sdk/client-kms')) as AwsKmsModule;
    return {
      client: new mod.KMSClient({
        region: this.opts.region,
        ...(this.opts.endpoint ? { endpoint: this.opts.endpoint } : {}),
      }),
      GenerateDataKeyCommand: mod.GenerateDataKeyCommand,
      DecryptCommand: mod.DecryptCommand,
    };
  }
}

function normalizeAwsAad(
  aad: Record<string, string> | undefined,
): Record<string, string> | undefined {
  if (!aad || Object.keys(aad).length === 0) return undefined;
  // AWS KMS EncryptionContext is an unordered string map. Sorting via
  // canonicalAad before reconstructing the object gives tests and logs
  // deterministic input while preserving KMS's native AAD semantics.
  return Object.fromEntries(
    JSON.parse(canonicalAad(aad).toString('utf8')) as Array<[string, string]>,
  );
}

function isAwsKmsAuthFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return (
    name === 'InvalidCiphertextException' ||
    name === 'IncorrectKeyException' ||
    name === 'NotFoundException'
  );
}
