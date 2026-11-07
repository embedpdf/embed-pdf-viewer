import { Buffer } from 'node:buffer';
import { describe, expect, test, beforeEach, vi } from 'vitest';
import {
  AzureKeyVaultKeyring,
  AzureKeyVaultSecretsProvider,
  GcpKmsKeyring,
  GcpSecretManagerProvider,
  KmsAadMismatch,
  SecretNotFound,
} from '../src/index';
import { DefaultAzureCredential, identity } from '../__mocks__/@azure/identity';
import { CryptographyClient, keyVaultKeys } from '../__mocks__/@azure/keyvault-keys';
import { SecretClient, keyVaultSecrets } from '../__mocks__/@azure/keyvault-secrets';
import { KeyManagementServiceClient, cloudKms } from '../__mocks__/@google-cloud/kms';
import {
  SecretManagerServiceClient,
  secretManager,
} from '../__mocks__/@google-cloud/secret-manager';

// No factories: vitest serves each SDK's fake from __mocks__/.
vi.mock('@google-cloud/secret-manager');
vi.mock('@google-cloud/kms');
vi.mock('@azure/identity');
vi.mock('@azure/keyvault-secrets');
vi.mock('@azure/keyvault-keys');

describe('GcpSecretManagerProvider', () => {
  beforeEach(() => resetCloudMocks());

  test('reads a JSON-keyed secret from Google Secret Manager', async () => {
    secretManager.accessSecretVersion.mockResolvedValue([
      {
        name: 'projects/acme/secrets/prod-embedpdf/versions/7',
        payload: { data: Buffer.from(JSON.stringify({ jwtSecret: 'gcp-secret' })) },
      },
    ]);

    const provider = new GcpSecretManagerProvider({ project: 'acme' });
    const value = await provider.get({
      provider: 'gcp',
      name: 'prod-embedpdf',
      version: '7',
      jsonKey: 'jwtSecret',
    });

    expect(value.bytes.toString('utf8')).toBe('gcp-secret');
    expect(value.version).toBe('7');
    expect(secretManager.accessSecretVersion).toHaveBeenCalledWith({
      name: 'projects/acme/secrets/prod-embedpdf/versions/7',
    });
  });

  test('maps Google not-found responses to SecretNotFound', async () => {
    secretManager.accessSecretVersion.mockRejectedValue(
      Object.assign(new Error('missing'), { code: 5 }),
    );

    const provider = new GcpSecretManagerProvider({ project: 'acme' });
    await expect(provider.get({ provider: 'gcp', name: 'missing' })).rejects.toBeInstanceOf(
      SecretNotFound,
    );
  });
});

describe('GcpKmsKeyring', () => {
  beforeEach(() => resetCloudMocks());

  test('wraps local data keys with Google KMS and native AAD', async () => {
    const ciphertext = Buffer.from('gcp-wrapped-data-key');
    cloudKms.encrypt.mockResolvedValue([{ ciphertext }]);

    const keyring = new GcpKmsKeyring({
      keyId: 'projects/acme/locations/global/keyRings/embedpdf/cryptoKeys/main',
    });
    const dataKey = await keyring.generateDataKey({ tenantId: 'tenant-a' });

    expect(dataKey.plaintext.byteLength).toBe(32);
    expect(dataKey.wrapped).toMatchObject({
      providerId: 'gcp-kms',
      keyId: 'projects/acme/locations/global/keyRings/embedpdf/cryptoKeys/main',
      algorithm: 'AES_256_GCM',
      version: 1,
    });
    expect(dataKey.wrapped.ciphertext.equals(ciphertext)).toBe(true);
    expect(cloudKms.encrypt.mock.calls[0]?.[0]).toMatchObject({
      name: 'projects/acme/locations/global/keyRings/embedpdf/cryptoKeys/main',
      additionalAuthenticatedData: Buffer.from('[["tenantId","tenant-a"]]'),
    });
    expect(
      (cloudKms.encrypt.mock.calls[0]?.[0] as { plaintext: Buffer }).plaintext.byteLength,
    ).toBe(32);
  });

  test('decrypts with the same Google KMS AAD and maps auth failures', async () => {
    const plaintext = Buffer.alloc(32, 4);
    const ciphertext = Buffer.from('gcp-wrapped-data-key');
    cloudKms.decrypt.mockResolvedValueOnce([{ plaintext }]);

    const keyring = new GcpKmsKeyring({
      keyId: 'projects/acme/locations/global/keyRings/r/cryptoKeys/k',
    });
    await expect(
      keyring.decryptDataKey(
        {
          providerId: 'gcp-kms',
          keyId: 'projects/acme/locations/global/keyRings/r/cryptoKeys/k',
          algorithm: 'AES_256_GCM',
          version: 1,
          ciphertext,
        },
        { tenantId: 'tenant-a' },
      ),
    ).resolves.toEqual(plaintext);
    expect(cloudKms.decrypt.mock.calls[0]?.[0]).toMatchObject({
      name: 'projects/acme/locations/global/keyRings/r/cryptoKeys/k',
      ciphertext,
      additionalAuthenticatedData: Buffer.from('[["tenantId","tenant-a"]]'),
    });

    cloudKms.decrypt.mockRejectedValueOnce(Object.assign(new Error('bad aad'), { code: 3 }));
    await expect(
      keyring.decryptDataKey(
        {
          providerId: 'gcp-kms',
          keyId: 'projects/acme/locations/global/keyRings/r/cryptoKeys/k',
          algorithm: 'AES_256_GCM',
          version: 1,
          ciphertext,
        },
        { tenantId: 'tenant-b' },
      ),
    ).rejects.toBeInstanceOf(KmsAadMismatch);
  });
});

describe('AzureKeyVaultSecretsProvider', () => {
  beforeEach(() => resetCloudMocks());

  test('reads a JSON-keyed secret from Azure Key Vault', async () => {
    keyVaultSecrets.getSecret.mockResolvedValue({
      value: JSON.stringify({ jwtSecret: 'azure-secret' }),
      properties: { version: 'v1' },
    });

    const provider = new AzureKeyVaultSecretsProvider({
      vaultUrl: 'https://vault.vault.azure.net',
    });
    const value = await provider.get({
      provider: 'azure',
      name: 'embedpdf',
      version: 'v1',
      jsonKey: 'jwtSecret',
    });

    expect(value.bytes.toString('utf8')).toBe('azure-secret');
    expect(value.version).toBe('v1');
    expect(keyVaultSecrets.getSecret).toHaveBeenCalledWith('embedpdf', { version: 'v1' });
  });

  test('maps Azure not-found responses to SecretNotFound', async () => {
    keyVaultSecrets.getSecret.mockRejectedValue(
      Object.assign(new Error('missing'), { statusCode: 404 }),
    );

    const provider = new AzureKeyVaultSecretsProvider({
      vaultUrl: 'https://vault.vault.azure.net',
    });
    await expect(provider.get({ provider: 'azure', name: 'missing' })).rejects.toBeInstanceOf(
      SecretNotFound,
    );
  });
});

describe('AzureKeyVaultKeyring', () => {
  beforeEach(() => resetCloudMocks());

  test('uses Managed HSM A256GCM with native Azure AAD', async () => {
    const ciphertext = Buffer.from('azure-managed-hsm-ciphertext');
    const tag = Buffer.from('azure-managed-hsm-tag');
    keyVaultKeys.encrypt.mockResolvedValue({ result: ciphertext, authenticationTag: tag });

    const keyring = new AzureKeyVaultKeyring({
      vaultUrl: 'https://hsm.managedhsm.azure.net',
      keyName: 'embedpdf',
      keyVersion: '123',
      mode: 'managed-hsm-a256gcm',
    });
    const dataKey = await keyring.generateDataKey({ tenantId: 'tenant-a' });

    expect(dataKey.plaintext.byteLength).toBe(32);
    expect(dataKey.wrapped).toMatchObject({
      providerId: 'azure-kv',
      keyId: 'https://hsm.managedhsm.azure.net/keys/embedpdf/123',
      algorithm: 'AES_256_GCM',
      version: 1,
    });
    expect(keyVaultKeys.encrypt.mock.calls[0]?.[0]).toMatchObject({
      algorithm: 'A256GCM',
      plaintext: expect.any(Buffer),
      additionalAuthenticatedData: Buffer.from('[["tenantId","tenant-a"]]'),
      iv: expect.any(Buffer),
    });
    expect((keyVaultKeys.encrypt.mock.calls[0]?.[0] as { iv: Buffer }).iv.byteLength).toBe(12);

    keyVaultKeys.decrypt.mockResolvedValue({ result: dataKey.plaintext });
    await expect(
      keyring.decryptDataKey(dataKey.wrapped, { tenantId: 'tenant-a' }),
    ).resolves.toEqual(dataKey.plaintext);
    expect(keyVaultKeys.decrypt.mock.calls[0]?.[0]).toMatchObject({
      algorithm: 'A256GCM',
      ciphertext,
      additionalAuthenticatedData: Buffer.from('[["tenantId","tenant-a"]]'),
      authenticationTag: tag,
    });
  });

  test('uses standard Key Vault RSA wrapping and enforces AAD with an envelope MAC', async () => {
    keyVaultKeys.wrapKey.mockResolvedValue({ result: Buffer.from('azure-wrapped-data-key') });

    const keyring = new AzureKeyVaultKeyring({
      vaultUrl: 'https://vault.vault.azure.net',
      keyName: 'embedpdf',
      keyVersion: '123',
      mode: 'key-vault-rsa-oaep-256',
    });
    const dataKey = await keyring.generateDataKey({ tenantId: 'tenant-a' });

    expect(dataKey.plaintext.byteLength).toBe(32);
    expect(dataKey.wrapped).toMatchObject({
      providerId: 'azure-kv',
      keyId: 'https://vault.vault.azure.net/keys/embedpdf/123',
      algorithm: 'AES_256_GCM',
      version: 1,
    });
    expect(keyVaultKeys.clientOptions[0]).toMatchObject({
      keyId: 'https://vault.vault.azure.net/keys/embedpdf/123',
    });
    expect(keyVaultKeys.wrapKey.mock.calls[0]?.[0]).toBe('RSA-OAEP-256');
    expect((keyVaultKeys.wrapKey.mock.calls[0]?.[1] as Buffer).byteLength).toBe(32);

    keyVaultKeys.unwrapKey.mockResolvedValue({ result: dataKey.plaintext });
    await expect(
      keyring.decryptDataKey(dataKey.wrapped, { tenantId: 'tenant-a' }),
    ).resolves.toEqual(dataKey.plaintext);
    await expect(
      keyring.decryptDataKey(dataKey.wrapped, { tenantId: 'tenant-b' }),
    ).rejects.toBeInstanceOf(KmsAadMismatch);
  });

  test('rejects malformed vault config at construction with actionable errors', () => {
    const base = { keyName: 'embedpdf', mode: 'key-vault-rsa-oaep-256' as const };
    expect(() => new AzureKeyVaultKeyring({ ...base, vaultUrl: 'not a url' })).toThrow(
      /not a valid URL/,
    );
    expect(
      () => new AzureKeyVaultKeyring({ ...base, vaultUrl: 'http://vault.vault.azure.net' }),
    ).toThrow(/must use https/);
    expect(
      () => new AzureKeyVaultKeyring({ ...base, vaultUrl: 'https://vault.vault.azure.net/extra' }),
    ).toThrow(/origin-only/);
    expect(
      () => new AzureKeyVaultKeyring({ ...base, vaultUrl: 'https://vault.vault.azure.net/?q=1' }),
    ).toThrow(/origin-only/);
    expect(
      () =>
        new AzureKeyVaultKeyring({
          vaultUrl: 'https://vault.vault.azure.net',
          keyName: 'bad/name',
        }),
    ).toThrow(/keyName/);
    expect(
      () =>
        new AzureKeyVaultKeyring({
          vaultUrl: 'https://vault.vault.azure.net',
          keyName: 'embedpdf',
          keyVersion: '../escape',
        }),
    ).toThrow(/keyVersion/);
  });

  test('keeps the durable keyId byte-identical for previously-valid configs', () => {
    // `keyId` is stored inside every wrapped envelope and compared on
    // decrypt — trailing-slash handling must keep producing the exact
    // historical string.
    const plain = new AzureKeyVaultKeyring({
      vaultUrl: 'https://vault.vault.azure.net',
      keyName: 'embedpdf',
    });
    expect(plain.info.keyId).toBe('https://vault.vault.azure.net/keys/embedpdf');
    const slashed = new AzureKeyVaultKeyring({
      vaultUrl: 'https://vault.vault.azure.net/',
      keyName: 'embedpdf',
      keyVersion: 'abc123',
    });
    expect(slashed.info.keyId).toBe('https://vault.vault.azure.net/keys/embedpdf/abc123');
  });
});

describe('adapters built back to back', () => {
  // Each constructor starts its own SDK imports, so these imports overlap.
  // A vi.mock factory hands some of them the real clients.
  const azureFake = (c: unknown, Client: typeof SecretClient | typeof CryptographyClient) =>
    c instanceof Client && c.credential instanceof DefaultAzureCredential;
  test.each([
    {
      name: 'GcpSecretManagerProvider',
      make: () => new GcpSecretManagerProvider({ project: 'acme' }),
      isFake: (c: unknown) => c instanceof SecretManagerServiceClient,
    },
    {
      name: 'GcpKmsKeyring',
      make: () =>
        new GcpKmsKeyring({
          keyId: 'projects/acme/locations/global/keyRings/embedpdf/cryptoKeys/main',
        }),
      isFake: (c: unknown) => c instanceof KeyManagementServiceClient,
    },
    {
      name: 'AzureKeyVaultSecretsProvider',
      make: () => new AzureKeyVaultSecretsProvider({ vaultUrl: 'https://vault.vault.azure.net' }),
      isFake: (c: unknown) => azureFake(c, SecretClient),
    },
    {
      name: 'AzureKeyVaultKeyring',
      make: () =>
        new AzureKeyVaultKeyring({
          vaultUrl: 'https://vault.vault.azure.net',
          keyName: 'embedpdf',
          keyVersion: '123',
          mode: 'key-vault-rsa-oaep-256',
        }),
      isFake: (c: unknown) => azureFake(c, CryptographyClient),
    },
  ])('every $name gets the fake SDK clients', async ({ make, isFake }) => {
    const clients = await Promise.all(Array.from({ length: 8 }, () => clientOf(make())));
    expect(clients.every(isFake)).toBe(true);
  });
});

/** An adapter's SDK client, read without calling it: a real one would call the cloud. */
function clientOf(adapter: object): Promise<unknown> {
  return (adapter as { clientPromise?: Promise<unknown> }).clientPromise!;
}

function resetCloudMocks(): void {
  secretManager.accessSecretVersion.mockReset();
  cloudKms.encrypt.mockReset();
  cloudKms.decrypt.mockReset();
  keyVaultSecrets.getSecret.mockReset();
  keyVaultKeys.encrypt.mockReset();
  keyVaultKeys.decrypt.mockReset();
  keyVaultKeys.wrapKey.mockReset();
  keyVaultKeys.unwrapKey.mockReset();
  identity.credentials = 0;
  keyVaultSecrets.clientOptions.length = 0;
  keyVaultKeys.clientOptions.length = 0;
}
