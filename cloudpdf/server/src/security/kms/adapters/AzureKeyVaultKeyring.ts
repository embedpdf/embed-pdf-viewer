import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  KmsAadMismatch,
  KmsUnreachable,
  canonicalAad,
  type DataKey,
  type KmsKeyring,
  type WrappedDataKey,
} from '../KmsKeyring';

export interface AzureKeyVaultKeyringOptions {
  vaultUrl: string;
  keyName: string;
  keyVersion?: string;
  mode?: AzureKeyVaultKeyringMode;
}

type AzureCredential = unknown;

export type AzureKeyVaultKeyringMode = 'managed-hsm-a256gcm' | 'key-vault-rsa-oaep-256';

type AzureIdentityModule = {
  DefaultAzureCredential: new () => AzureCredential;
};

type AzureCryptographyClient = {
  encrypt(input: {
    algorithm: 'A256GCM';
    plaintext: Buffer;
    additionalAuthenticatedData?: Buffer;
    iv: Buffer;
  }): Promise<{ result?: Uint8Array; iv?: Uint8Array; authenticationTag?: Uint8Array }>;
  decrypt(input: {
    algorithm: 'A256GCM';
    ciphertext: Buffer;
    additionalAuthenticatedData?: Buffer;
    iv: Buffer;
    authenticationTag: Buffer;
  }): Promise<{ result?: Uint8Array }>;
  wrapKey(algorithm: 'RSA-OAEP-256', key: Buffer): Promise<{ result?: Uint8Array }>;
  unwrapKey(algorithm: 'RSA-OAEP-256', encryptedKey: Buffer): Promise<{ result?: Uint8Array }>;
};

type AzureKeysModule = {
  CryptographyClient: new (keyId: string, credential: AzureCredential) => AzureCryptographyClient;
};

type AzureWrappedDataKeyEnvelope =
  | {
      v: 1;
      mode: 'managed-hsm-a256gcm';
      iv: string;
      tag: string;
      ciphertext: string;
    }
  | {
      v: 1;
      mode: 'key-vault-rsa-oaep-256';
      mac: string;
      wrapped: string;
    };

export class AzureKeyVaultKeyring implements KmsKeyring {
  readonly info: {
    kind: 'azure-kv';
    keyId: string;
    vaultUrl: string;
    mode: AzureKeyVaultKeyringMode;
  };
  private readonly clientPromise: Promise<AzureCryptographyClient>;

  constructor(opts: AzureKeyVaultKeyringOptions) {
    this.info = {
      kind: 'azure-kv',
      keyId: keyUrl(opts),
      vaultUrl: opts.vaultUrl,
      mode: opts.mode ?? 'key-vault-rsa-oaep-256',
    };
    this.clientPromise = this.createClient();
  }

  async generateDataKey(aad?: Record<string, string>): Promise<DataKey> {
    const plaintext = randomBytes(32);
    try {
      const client = await this.clientPromise;
      const envelope =
        this.info.mode === 'managed-hsm-a256gcm'
          ? await encryptManagedHsmAesGcm(client, plaintext, aad)
          : await wrapStandardKeyVaultRsa(client, plaintext, aad);
      return {
        plaintext,
        wrapped: {
          providerId: this.info.kind,
          keyId: this.info.keyId,
          algorithm: 'AES_256_GCM',
          version: 1,
          ciphertext: encodeEnvelope(envelope),
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
      const envelope = decodeEnvelope(wrapped.ciphertext);
      const client = await this.clientPromise;
      const plaintext =
        envelope.mode === 'managed-hsm-a256gcm'
          ? await decryptManagedHsmAesGcm(client, envelope, aad)
          : await unwrapStandardKeyVaultRsa(client, envelope, aad);
      if (plaintext.byteLength !== 32) throw new KmsAadMismatch();
      return plaintext;
    } catch (err) {
      if (err instanceof KmsAadMismatch) throw err;
      if (isAzureKmsAuthFailure(err)) throw new KmsAadMismatch();
      throw new KmsUnreachable(err);
    }
  }

  private async createClient(): Promise<AzureCryptographyClient> {
    const [identity, keys] = await Promise.all([
      import('@azure/identity') as Promise<unknown> as Promise<AzureIdentityModule>,
      import('@azure/keyvault-keys') as Promise<unknown> as Promise<AzureKeysModule>,
    ]);
    return new keys.CryptographyClient(this.info.keyId, new identity.DefaultAzureCredential());
  }
}

async function encryptManagedHsmAesGcm(
  client: AzureCryptographyClient,
  plaintext: Buffer,
  aad: Record<string, string> | undefined,
): Promise<AzureWrappedDataKeyEnvelope> {
  const iv = randomBytes(12);
  const res = await client.encrypt({
    algorithm: 'A256GCM',
    plaintext,
    additionalAuthenticatedData: canonicalAad(aad),
    iv,
  });
  if (!res.result || !res.authenticationTag) {
    throw new KmsUnreachable(new Error('Azure Managed HSM encrypt returned incomplete result'));
  }
  return {
    v: 1,
    mode: 'managed-hsm-a256gcm',
    iv: Buffer.from(res.iv ?? iv).toString('base64url'),
    tag: Buffer.from(res.authenticationTag).toString('base64url'),
    ciphertext: Buffer.from(res.result).toString('base64url'),
  };
}

async function decryptManagedHsmAesGcm(
  client: AzureCryptographyClient,
  envelope: Extract<AzureWrappedDataKeyEnvelope, { mode: 'managed-hsm-a256gcm' }>,
  aad: Record<string, string> | undefined,
): Promise<Buffer> {
  const res = await client.decrypt({
    algorithm: 'A256GCM',
    ciphertext: Buffer.from(envelope.ciphertext, 'base64url'),
    additionalAuthenticatedData: canonicalAad(aad),
    iv: Buffer.from(envelope.iv, 'base64url'),
    authenticationTag: Buffer.from(envelope.tag, 'base64url'),
  });
  if (!res.result) throw new KmsAadMismatch();
  return Buffer.from(res.result);
}

async function wrapStandardKeyVaultRsa(
  client: AzureCryptographyClient,
  plaintext: Buffer,
  aad: Record<string, string> | undefined,
): Promise<AzureWrappedDataKeyEnvelope> {
  const res = await client.wrapKey('RSA-OAEP-256', plaintext);
  if (!res.result) {
    throw new KmsUnreachable(new Error('Azure Key Vault wrapKey returned no result'));
  }
  return {
    v: 1,
    mode: 'key-vault-rsa-oaep-256',
    mac: aadMac(plaintext, aad).toString('base64url'),
    wrapped: Buffer.from(res.result).toString('base64url'),
  };
}

async function unwrapStandardKeyVaultRsa(
  client: AzureCryptographyClient,
  envelope: Extract<AzureWrappedDataKeyEnvelope, { mode: 'key-vault-rsa-oaep-256' }>,
  aad: Record<string, string> | undefined,
): Promise<Buffer> {
  const res = await client.unwrapKey('RSA-OAEP-256', Buffer.from(envelope.wrapped, 'base64url'));
  if (!res.result) throw new KmsAadMismatch();
  const plaintext = Buffer.from(res.result);
  const actualMac = aadMac(plaintext, aad);
  const expectedMac = Buffer.from(envelope.mac, 'base64url');
  if (actualMac.byteLength !== expectedMac.byteLength || !timingSafeEqual(actualMac, expectedMac)) {
    throw new KmsAadMismatch();
  }
  return plaintext;
}

function keyUrl(opts: AzureKeyVaultKeyringOptions): string {
  const root = opts.vaultUrl.replace(/\/+$/, '');
  const key = `${root}/keys/${opts.keyName}`;
  return opts.keyVersion ? `${key}/${opts.keyVersion}` : key;
}

function aadMac(dataKey: Buffer, aad: Record<string, string> | undefined): Buffer {
  return createHmac('sha256', dataKey).update(canonicalAad(aad)).digest();
}

function encodeEnvelope(envelope: AzureWrappedDataKeyEnvelope): Buffer {
  return Buffer.from(JSON.stringify(envelope), 'utf8');
}

function decodeEnvelope(bytes: Buffer): AzureWrappedDataKeyEnvelope {
  try {
    const parsed = JSON.parse(bytes.toString('utf8')) as Partial<AzureWrappedDataKeyEnvelope>;
    if (parsed.v !== 1 || typeof parsed.mode !== 'string') {
      throw new KmsAadMismatch();
    }
    if (parsed.mode === 'managed-hsm-a256gcm') {
      if (
        typeof parsed.iv !== 'string' ||
        typeof parsed.tag !== 'string' ||
        typeof parsed.ciphertext !== 'string'
      ) {
        throw new KmsAadMismatch();
      }
      return parsed as AzureWrappedDataKeyEnvelope;
    }
    if (parsed.mode === 'key-vault-rsa-oaep-256') {
      if (typeof parsed.mac !== 'string' || typeof parsed.wrapped !== 'string') {
        throw new KmsAadMismatch();
      }
      return parsed as AzureWrappedDataKeyEnvelope;
    }
    throw new KmsAadMismatch();
  } catch (err) {
    if (err instanceof KmsAadMismatch) throw err;
    throw new KmsAadMismatch();
  }
}

function isAzureKmsAuthFailure(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  const code = (err as { code?: unknown }).code;
  return statusCode === 404 || code === 'KeyNotFound' || code === 'CryptographyError';
}
