import {
  decodeSecretBytes,
  SecretNotFound,
  SecretProviderUnreachable,
  type SecretRef,
  type SecretsProvider,
  type SecretValue,
} from '../SecretsProvider';

export interface GcpSecretManagerProviderOptions {
  project: string;
}

type GcpSecretManagerClient = {
  accessSecretVersion(input: { name: string }): Promise<
    [
      {
        name?: string;
        payload?: { data?: Uint8Array | string | null };
      },
      ...unknown[],
    ]
  >;
};

type GcpSecretManagerModule = {
  SecretManagerServiceClient: new () => GcpSecretManagerClient;
};

export class GcpSecretManagerProvider implements SecretsProvider {
  readonly info: { kind: 'gcp-sm'; project: string };
  private readonly clientPromise: Promise<GcpSecretManagerClient>;

  constructor(private readonly opts: GcpSecretManagerProviderOptions) {
    this.info = { kind: 'gcp-sm', project: opts.project };
    this.clientPromise = this.createClient();
  }

  async get(ref: SecretRef): Promise<SecretValue> {
    try {
      const client = await this.clientPromise;
      const [res] = await client.accessSecretVersion({
        name: secretVersionName(this.opts.project, ref),
      });
      const raw = rawSecretBytes(res.payload?.data);
      if (!raw || raw.byteLength === 0) throw new SecretNotFound(ref, this.info.kind);
      return {
        bytes: decodeSecretBytes(raw, ref),
        version: res.name?.split('/').at(-1),
        fetchedAt: new Date(),
      };
    } catch (err) {
      if (err instanceof SecretNotFound || isGcpNotFound(err)) {
        throw new SecretNotFound(ref, this.info.kind);
      }
      throw new SecretProviderUnreachable(this.info.kind, err);
    }
  }

  invalidate(_ref: SecretRef): void {
    // GCP reads are cached by the CachingSecretsProvider decorator.
  }

  private async createClient(): Promise<GcpSecretManagerClient> {
    const mod = (await import('@google-cloud/secret-manager')) as unknown as GcpSecretManagerModule;
    return new mod.SecretManagerServiceClient();
  }
}

function secretVersionName(project: string, ref: SecretRef): string {
  if (ref.name.startsWith('projects/')) return ref.name;
  return `projects/${project}/secrets/${ref.name}/versions/${ref.version ?? 'latest'}`;
}

function rawSecretBytes(data: Uint8Array | string | null | undefined): Buffer | null {
  if (data == null) return null;
  if (typeof data === 'string') return Buffer.from(data, 'utf8');
  return Buffer.from(data);
}

function isGcpNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const code = (err as { code?: unknown }).code;
  return code === 5 || code === 'NOT_FOUND';
}
