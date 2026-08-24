import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  AwsKmsKeyring,
  AwsSecretsManagerProvider,
  KmsAadMismatch,
  SecretNotFound,
} from '../src/index';

const aws = vi.hoisted(() => ({
  secretsSend: vi.fn(),
  secretsClientOptions: [] as unknown[],
  kmsSend: vi.fn(),
  kmsClientOptions: [] as unknown[],
}));

vi.mock('@aws-sdk/client-secrets-manager', () => ({
  SecretsManagerClient: class {
    constructor(opts: unknown) {
      aws.secretsClientOptions.push(opts);
    }

    send(command: unknown) {
      return aws.secretsSend(command);
    }
  },
  GetSecretValueCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

vi.mock('@aws-sdk/client-kms', () => ({
  KMSClient: class {
    constructor(opts: unknown) {
      aws.kmsClientOptions.push(opts);
    }

    send(command: unknown) {
      return aws.kmsSend(command);
    }
  },
  GenerateDataKeyCommand: class {
    constructor(readonly input: unknown) {}
  },
  DecryptCommand: class {
    constructor(readonly input: unknown) {}
  },
}));

describe('AwsSecretsManagerProvider', () => {
  beforeEach(() => {
    aws.secretsSend.mockReset();
    aws.secretsClientOptions.length = 0;
  });

  test('reads a JSON-keyed secret from AWS Secrets Manager', async () => {
    aws.secretsSend.mockResolvedValue({
      SecretString: JSON.stringify({ jwtSecret: 'super-secret' }),
      VersionId: 'v-1',
    });

    const provider = new AwsSecretsManagerProvider({
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
    });
    const value = await provider.get({
      provider: 'aws-sm',
      name: 'prod/embedpdf/secrets',
      jsonKey: 'jwtSecret',
      versionStage: 'AWSCURRENT',
    });

    expect(value.bytes.toString('utf8')).toBe('super-secret');
    expect(value.version).toBe('v-1');
    expect(aws.secretsClientOptions).toEqual([
      { region: 'us-east-1', endpoint: 'http://localhost:4566' },
    ]);
    expect(commandInput(aws.secretsSend.mock.calls[0]?.[0])).toEqual({
      SecretId: 'prod/embedpdf/secrets',
      VersionStage: 'AWSCURRENT',
    });
  });

  test('decodes binary secrets before applying the requested encoding', async () => {
    aws.secretsSend.mockResolvedValue({
      SecretBinary: Buffer.from('736563726574', 'utf8').toString('base64'),
    });

    const provider = new AwsSecretsManagerProvider({ region: 'us-east-1' });
    const value = await provider.get({
      provider: 'aws-sm',
      name: 'hex-secret',
      encoding: 'hex',
    });

    expect(value.bytes.toString('utf8')).toBe('secret');
  });

  test('maps AWS not-found responses to SecretNotFound', async () => {
    aws.secretsSend.mockRejectedValue(
      Object.assign(new Error('missing'), { name: 'ResourceNotFoundException' }),
    );

    const provider = new AwsSecretsManagerProvider({ region: 'us-east-1' });
    await expect(provider.get({ provider: 'aws-sm', name: 'missing' })).rejects.toBeInstanceOf(
      SecretNotFound,
    );
  });
});

describe('AwsKmsKeyring', () => {
  beforeEach(() => {
    aws.kmsSend.mockReset();
    aws.kmsClientOptions.length = 0;
  });

  test('generates an AES-256 data key with deterministic encryption context', async () => {
    const plaintext = Buffer.alloc(32, 7);
    const wrapped = Buffer.from('wrapped-data-key');
    aws.kmsSend.mockResolvedValue({
      Plaintext: plaintext,
      CiphertextBlob: wrapped,
      KeyId: 'arn:aws:kms:us-east-1:111:key/abc',
    });

    const keyring = new AwsKmsKeyring({
      keyId: 'alias/embedpdf',
      region: 'us-east-1',
      endpoint: 'http://localhost:4566',
    });
    const dataKey = await keyring.generateDataKey({ tenantId: 'tenant-a', docId: 'doc-a' });

    expect(dataKey.plaintext.equals(plaintext)).toBe(true);
    expect(dataKey.wrapped).toMatchObject({
      providerId: 'aws-kms',
      keyId: 'arn:aws:kms:us-east-1:111:key/abc',
      algorithm: 'AES_256_GCM',
      version: 1,
    });
    expect(dataKey.wrapped.ciphertext.equals(wrapped)).toBe(true);
    expect(aws.kmsClientOptions).toEqual([
      { region: 'us-east-1', endpoint: 'http://localhost:4566' },
    ]);
    expect(commandInput(aws.kmsSend.mock.calls[0]?.[0])).toEqual({
      KeyId: 'alias/embedpdf',
      KeySpec: 'AES_256',
      EncryptionContext: { docId: 'doc-a', tenantId: 'tenant-a' },
    });
  });

  test('decrypts a wrapped data key with the same encryption context', async () => {
    const plaintext = Buffer.alloc(32, 3);
    const ciphertext = Buffer.from('wrapped-data-key');
    aws.kmsSend.mockResolvedValue({ Plaintext: plaintext });

    const keyring = new AwsKmsKeyring({ keyId: 'alias/embedpdf', region: 'us-east-1' });
    const unwrapped = await keyring.decryptDataKey(
      {
        providerId: 'aws-kms',
        keyId: 'alias/embedpdf',
        algorithm: 'AES_256_GCM',
        version: 1,
        ciphertext,
      },
      { tenantId: 'tenant-a' },
    );

    expect(unwrapped.equals(plaintext)).toBe(true);
    expect(commandInput(aws.kmsSend.mock.calls[0]?.[0])).toEqual({
      CiphertextBlob: ciphertext,
      EncryptionContext: { tenantId: 'tenant-a' },
    });
  });

  test('maps AWS decrypt authentication failures to KmsAadMismatch', async () => {
    aws.kmsSend.mockRejectedValue(
      Object.assign(new Error('bad ciphertext'), { name: 'InvalidCiphertextException' }),
    );

    const keyring = new AwsKmsKeyring({ keyId: 'alias/embedpdf', region: 'us-east-1' });
    await expect(
      keyring.decryptDataKey(
        {
          providerId: 'aws-kms',
          keyId: 'alias/embedpdf',
          algorithm: 'AES_256_GCM',
          version: 1,
          ciphertext: Buffer.from('wrapped-data-key'),
        },
        { tenantId: 'tenant-a' },
      ),
    ).rejects.toBeInstanceOf(KmsAadMismatch);
  });
});

function commandInput(command: unknown): unknown {
  return (command as { input?: unknown } | undefined)?.input;
}
