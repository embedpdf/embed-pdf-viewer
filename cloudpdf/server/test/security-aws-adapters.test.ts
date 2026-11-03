import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  AwsKmsKeyring,
  AwsSecretsManagerProvider,
  KmsAadMismatch,
  SecretNotFound,
} from '../src/index';
import { KMSClient, awsKms } from '../__mocks__/@aws-sdk/client-kms';
import { SecretsManagerClient, secretsManager } from '../__mocks__/@aws-sdk/client-secrets-manager';

// No factories: vitest serves each SDK's fake from __mocks__/.
vi.mock('@aws-sdk/client-secrets-manager');
vi.mock('@aws-sdk/client-kms');

describe('AwsSecretsManagerProvider', () => {
  beforeEach(() => {
    secretsManager.send.mockReset();
    secretsManager.clientOptions.length = 0;
  });

  test('reads a JSON-keyed secret from AWS Secrets Manager', async () => {
    secretsManager.send.mockResolvedValue({
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
    expect(secretsManager.clientOptions).toEqual([
      { region: 'us-east-1', endpoint: 'http://localhost:4566' },
    ]);
    expect(commandInput(secretsManager.send.mock.calls[0]?.[0])).toEqual({
      SecretId: 'prod/embedpdf/secrets',
      VersionStage: 'AWSCURRENT',
    });
  });

  test('decodes binary secrets before applying the requested encoding', async () => {
    secretsManager.send.mockResolvedValue({
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
    secretsManager.send.mockRejectedValue(
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
    awsKms.send.mockReset();
    awsKms.clientOptions.length = 0;
  });

  test('generates an AES-256 data key with deterministic encryption context', async () => {
    const plaintext = Buffer.alloc(32, 7);
    const wrapped = Buffer.from('wrapped-data-key');
    awsKms.send.mockResolvedValue({
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
    expect(awsKms.clientOptions).toEqual([
      { region: 'us-east-1', endpoint: 'http://localhost:4566' },
    ]);
    expect(commandInput(awsKms.send.mock.calls[0]?.[0])).toEqual({
      KeyId: 'alias/embedpdf',
      KeySpec: 'AES_256',
      EncryptionContext: { docId: 'doc-a', tenantId: 'tenant-a' },
    });
  });

  test('decrypts a wrapped data key with the same encryption context', async () => {
    const plaintext = Buffer.alloc(32, 3);
    const ciphertext = Buffer.from('wrapped-data-key');
    awsKms.send.mockResolvedValue({ Plaintext: plaintext });

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
    expect(commandInput(awsKms.send.mock.calls[0]?.[0])).toEqual({
      CiphertextBlob: ciphertext,
      EncryptionContext: { tenantId: 'tenant-a' },
    });
  });

  test('maps AWS decrypt authentication failures to KmsAadMismatch', async () => {
    awsKms.send.mockRejectedValue(
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

describe('adapters built back to back', () => {
  // Each constructor starts its own SDK import, so these imports overlap.
  // A vi.mock factory hands some of them the real clients.
  test.each([
    {
      name: 'AwsSecretsManagerProvider',
      make: () => new AwsSecretsManagerProvider({ region: 'us-east-1' }),
      Client: SecretsManagerClient,
    },
    {
      name: 'AwsKmsKeyring',
      make: () => new AwsKmsKeyring({ keyId: 'alias/embedpdf', region: 'us-east-1' }),
      Client: KMSClient,
    },
  ])('every $name gets the fake SDK client', async ({ make, Client }) => {
    const clients = await Promise.all(Array.from({ length: 8 }, () => clientOf(make())));
    expect(clients.every((c) => c instanceof Client)).toBe(true);
  });
});

/** An adapter's SDK client, read without calling it: a real one would call AWS. */
async function clientOf(adapter: object): Promise<unknown> {
  const created = (adapter as { clientPromise?: Promise<{ client: unknown }> }).clientPromise!;
  return (await created).client;
}
