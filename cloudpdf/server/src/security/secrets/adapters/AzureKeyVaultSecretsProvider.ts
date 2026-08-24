import {
  decodeSecretBytes,
  SecretNotFound,
  SecretProviderUnreachable,
  type SecretRef,
  type SecretsProvider,
  type SecretValue,
} from '../SecretsProvider';

export interface AzureKeyVaultSecretsProviderOptions {
  vaultUrl: string;
}

type AzureCredential = unknown;

type AzureIdentityModule = {
  DefaultAzureCredential: new () => AzureCredential;
};

type AzureSecretClient = {
  getSecret(
    name: string,
    opts?: { version?: string },
  ): Promise<{ value?: string; properties?: { version?: string } }>;
};

type AzureSecretsModule = {
  SecretClient: new (vaultUrl: string, credential: AzureCredential) => AzureSecretClient;
};

export class AzureKeyVaultSecretsProvider implements SecretsProvider {
  readonly info: { kind: 'azure-kv'; vaultUrl: string };
  private readonly clientPromise: Promise<AzureSecretClient>;

  constructor(private readonly opts: AzureKeyVaultSecretsProviderOptions) {
    this.info = { kind: 'azure-kv', vaultUrl: opts.vaultUrl };
    this.clientPromise = this.createClient();
  }

  async get(ref: SecretRef): Promise<SecretValue> {
    try {
      const client = await this.clientPromise;
      const res = await client.getSecret(ref.name, ref.version ? { version: ref.version } : {});
      if (!res.value) throw new SecretNotFound(ref, this.info.kind);
      return {
        bytes: decodeSecretBytes(Buffer.from(res.value, 'utf8'), ref),
        version: res.properties?.version,
        fetchedAt: new Date(),
      };
    } catch (err) {
      if (err instanceof SecretNotFound || isAzureNotFound(err)) {
        throw new SecretNotFound(ref, this.info.kind);
      }
      throw new SecretProviderUnreachable(this.info.kind, err);
    }
  }

  invalidate(_ref: SecretRef): void {
    // Azure reads are cached by the CachingSecretsProvider decorator.
  }

  private async createClient(): Promise<AzureSecretClient> {
    const [identity, secrets] = await Promise.all([
      import('@azure/identity') as Promise<unknown> as Promise<AzureIdentityModule>,
      import('@azure/keyvault-secrets') as Promise<unknown> as Promise<AzureSecretsModule>,
    ]);
    return new secrets.SecretClient(this.opts.vaultUrl, new identity.DefaultAzureCredential());
  }
}

function isAzureNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const statusCode = (err as { statusCode?: unknown }).statusCode;
  const code = (err as { code?: unknown }).code;
  return statusCode === 404 || code === 'SecretNotFound';
}
