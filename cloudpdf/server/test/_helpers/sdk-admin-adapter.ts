import { CloudPDFClient, CloudPDFError } from '../../../sdk/src/index';

export class AdminError extends Error {
  readonly code: string;
  readonly status: number;
  readonly body?: unknown;

  constructor(opts: { code: string; status: number; message: string; body?: unknown }) {
    super(opts.message);
    this.name = 'AdminError';
    this.code = opts.code;
    this.status = opts.status;
    this.body = opts.body;
  }
}

async function call<T>(promise: PromiseLike<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (!(error instanceof CloudPDFError)) throw error;
    const body = error.body as { error?: { code?: string; message?: string } } | undefined;
    throw new AdminError({
      code: body?.error?.code ?? `HTTP_${error.statusCode ?? 0}`,
      status: error.statusCode ?? 0,
      message: body?.error?.message ?? error.message,
      body,
    });
  }
}

class DocumentsAdapter {
  constructor(
    private readonly client: CloudPDFClient,
    private readonly tenantId: string,
  ) {}

  async create(input: Record<string, unknown> & { bytes: Uint8Array }): Promise<any> {
    return call(
      this.client.uploads.create({
        tenantId: this.tenantId,
        source: input.bytes,
        metadata: input['metadata'] as Record<string, unknown> | undefined,
        idempotencyKey: input['idempotencyKey'] as string | undefined,
        dedupMode: input['dedupMode'] as 'always-create' | 'reuse-existing' | undefined,
        docId: input['docId'] as string | undefined,
        uploadTtlSec: input['uploadTtlSec'] as number | undefined,
        uploadPreference: input['uploadPreference'] as 'auto' | 'presigned' | 'proxy' | undefined,
        signal: input['signal'] as AbortSignal | undefined,
        onProgress: input['onProgress'] as ((loaded: number, total: number) => void) | undefined,
      }),
    );
  }

  init(input: Record<string, unknown>): Promise<any> {
    return call(this.client.documents.init({ tenantId: this.tenantId, ...input } as never));
  }

  uploadProxy(input: { docId: string; body: Uint8Array }): Promise<any> {
    return call(
      this.client.documents.uploadProxy({
        file: input.body,
        tenantId: this.tenantId,
        id: input.docId,
      }),
    );
  }

  commit(input: { docId: string; sha256: string }): Promise<any> {
    return call(
      this.client.documents.commit({
        tenantId: this.tenantId,
        id: input.docId,
        sha256: input.sha256,
      }),
    );
  }

  async get(docId: string): Promise<any> {
    return (await call(this.client.documents.get({ tenantId: this.tenantId, id: docId }))).document;
  }

  async list(options: Record<string, unknown> = {}): Promise<any> {
    const pager = await call(
      this.client.documents.list({ tenantId: this.tenantId, ...options } as never),
    );
    const page = pager.response;
    return { ...page, nextCursor: page.nextCursor ?? null };
  }

  async *iterate(options: Record<string, unknown> = {}): AsyncGenerator<any> {
    const pager = await call(
      this.client.documents.list({ tenantId: this.tenantId, ...options } as never),
    );
    for (;;) {
      for (const document of pager.data) yield document;
      if (!pager.hasNextPage()) return;
      await call(pager.getNextPage());
    }
  }

  async delete(docId: string): Promise<void> {
    await call(this.client.documents.delete({ tenantId: this.tenantId, id: docId }));
  }

  async download(docId: string): Promise<Uint8Array> {
    const response = await call(
      this.client.documents.download({ tenantId: this.tenantId, id: docId }),
    );
    return response.bytes();
  }
}

class TokensAdapter {
  constructor(
    private readonly client: CloudPDFClient,
    private readonly tenantId: string,
  ) {}

  issueTenant(input: Record<string, unknown>): Promise<any> {
    return call(
      this.client.tokens.issue({
        tenantId: this.tenantId,
        body: { kind: 'tenant', ...input } as never,
      }),
    );
  }

  issueDoc(input: Record<string, unknown>): Promise<any> {
    return call(
      this.client.tokens.issue({
        tenantId: this.tenantId,
        body: { kind: 'doc', ...input } as never,
      }),
    );
  }

  async revoke(jti: string, options: Record<string, unknown> = {}): Promise<void> {
    await call(this.client.tokens.revoke({ tenantId: this.tenantId, jti, ...options } as never));
  }
}

class TenantAdapter {
  readonly documents: DocumentsAdapter;
  readonly tokens: TokensAdapter;

  constructor(client: CloudPDFClient, tenantId: string) {
    this.documents = new DocumentsAdapter(client, tenantId);
    this.tokens = new TokensAdapter(client, tenantId);
  }
}

class TenantsAdapter {
  constructor(private readonly client: CloudPDFClient) {}

  create(input: Record<string, unknown>): Promise<any> {
    return call(this.client.tenants.create(input as never));
  }

  async get(tenantId: string): Promise<any> {
    return (await call(this.client.tenants.get({ tenantId }))).tenant;
  }

  async list(options: Record<string, unknown> = {}): Promise<any> {
    const pager = await call(this.client.tenants.list(options as never));
    const page = pager.response;
    return { ...page, nextCursor: page.nextCursor ?? null };
  }

  async *iterate(options: Record<string, unknown> = {}): AsyncGenerator<any> {
    const pager = await call(this.client.tenants.list(options as never));
    for (;;) {
      for (const tenant of pager.data) yield tenant;
      if (!pager.hasNextPage()) return;
      await call(pager.getNextPage());
    }
  }

  async delete(tenantId: string): Promise<void> {
    await call(this.client.tenants.delete({ tenantId }));
  }
}

export function createCloudAdmin(options: {
  baseUrl: string;
  apiToken?: string;
  tenantToken?: string;
}): {
  tenants: TenantsAdapter;
  tenant(tenantId: string): TenantAdapter;
} {
  const token = options.apiToken ?? options.tenantToken;
  if (!token) throw new Error('apiToken or tenantToken is required');
  const client = new CloudPDFClient({
    baseUrl: options.baseUrl,
    environment: options.baseUrl,
    token,
  });
  return {
    tenants: new TenantsAdapter(client),
    tenant: (tenantId: string) => new TenantAdapter(client, tenantId),
  };
}
