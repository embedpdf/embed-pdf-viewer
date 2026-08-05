import {
  decodeSecretBytes,
  SecretNotFound,
  SecretProviderUnreachable,
  type SecretRef,
  type SecretsProvider,
  type SecretValue,
} from '../SecretsProvider';

export interface AwsSecretsManagerProviderOptions {
  region: string;
  endpoint?: string;
}

type AwsSecretsManagerClient = {
  send(command: unknown): Promise<{
    SecretBinary?: Uint8Array | string;
    SecretString?: string;
    VersionId?: string;
  }>;
};

type AwsSecretsManagerModule = {
  SecretsManagerClient: new (opts: {
    region: string;
    endpoint?: string;
  }) => AwsSecretsManagerClient;
  GetSecretValueCommand: new (input: {
    SecretId: string;
    VersionStage?: string;
    VersionId?: string;
  }) => unknown;
  ResourceNotFoundException?: new (...args: never[]) => Error;
};

export class AwsSecretsManagerProvider implements SecretsProvider {
  readonly info: { kind: 'aws-sm'; region: string; endpoint?: string };
  private readonly clientPromise: Promise<{
    client: AwsSecretsManagerClient;
    GetSecretValueCommand: AwsSecretsManagerModule['GetSecretValueCommand'];
  }>;

  constructor(private readonly opts: AwsSecretsManagerProviderOptions) {
    this.info = {
      kind: 'aws-sm',
      region: opts.region,
      ...(opts.endpoint ? { endpoint: opts.endpoint } : {}),
    };
    this.clientPromise = this.createClient();
  }

  async get(ref: SecretRef): Promise<SecretValue> {
    try {
      const { client, GetSecretValueCommand } = await this.clientPromise;
      const res = await client.send(
        new GetSecretValueCommand({
          SecretId: ref.name,
          ...(ref.versionStage ? { VersionStage: ref.versionStage } : {}),
          ...(ref.version ? { VersionId: ref.version } : {}),
        }),
      );
      const raw = rawSecretBytes(res.SecretBinary, res.SecretString);
      if (!raw || raw.byteLength === 0) throw new SecretNotFound(ref, this.info.kind);
      return {
        bytes: decodeSecretBytes(raw, ref),
        version: res.VersionId,
        fetchedAt: new Date(),
      };
    } catch (err) {
      if (err instanceof SecretNotFound || isAwsNotFound(err)) {
        throw new SecretNotFound(ref, this.info.kind);
      }
      throw new SecretProviderUnreachable(this.info.kind, err);
    }
  }

  invalidate(_ref: SecretRef): void {
    // AWS reads are cached by the CachingSecretsProvider decorator.
  }

  private async createClient(): Promise<{
    client: AwsSecretsManagerClient;
    GetSecretValueCommand: AwsSecretsManagerModule['GetSecretValueCommand'];
  }> {
    const mod = (await import('@aws-sdk/client-secrets-manager')) as AwsSecretsManagerModule;
    return {
      client: new mod.SecretsManagerClient({
        region: this.opts.region,
        ...(this.opts.endpoint ? { endpoint: this.opts.endpoint } : {}),
      }),
      GetSecretValueCommand: mod.GetSecretValueCommand,
    };
  }
}

function rawSecretBytes(
  binary: Uint8Array | string | undefined,
  text: string | undefined,
): Buffer | null {
  if (binary !== undefined) {
    if (typeof binary === 'string') return Buffer.from(binary, 'base64');
    return Buffer.from(binary);
  }
  if (text !== undefined) return Buffer.from(text, 'utf8');
  return null;
}

function isAwsNotFound(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const name = (err as { name?: unknown }).name;
  return name === 'ResourceNotFoundException';
}
