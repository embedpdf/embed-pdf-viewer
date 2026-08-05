import { Buffer } from 'node:buffer';
import { randomBytes, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createCloudAdmin } from '@cloudpdf/admin';
import {
  AzureFrontDoorCdnSigner,
  BunnyCdnSigner,
  CloudCdnSigner,
  CloudFrontCdnSigner,
  CustomHmacCdnSigner,
  NoneCdnSigner,
  buildApp,
  createLicenseRuntime,
  createKmsKeyring,
  createSecretResolver,
  createSecretsProviderRegistry,
  createSqliteDb,
  defaultWorkerEntryUrl,
  EventLogService,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  type AppBundle,
  type CloudPdfLicenseRuntime,
  type CdnSigner,
  type KmsConfig,
  type SecretsConfig,
  type TenantScope,
} from '@cloudpdf/server';
import { SharesStore } from './shares-store';

const root = resolve(import.meta.dirname, '..');
const dataRoot = resolve(process.env['CLOUDPDF_SMOKE_DATA_ROOT'] ?? `${root}/.data`);
const enginePort = Number(process.env['CLOUDPDF_SMOKE_ENGINE_PORT'] ?? 3210);
const apiPort = Number(process.env['CLOUDPDF_SMOKE_API_PORT'] ?? 3211);
const host = process.env['CLOUDPDF_SMOKE_HOST'] ?? '127.0.0.1';
const defaultTenant = process.env['CLOUDPDF_SMOKE_TENANT'] ?? 'tenant-demo';
const staticKmsKek =
  process.env['CLOUDPDF_SMOKE_STATIC_KMS_KEK'] ?? Buffer.alloc(32, 7).toString('base64');

/**
 * Which CDN signer to mount. Set `CLOUDPDF_SMOKE_CDN` to one of:
 *   none, bunny, cloud-cdn, cloudfront-cookies, cloudfront-urls,
 *   azure-fd, custom-hmac-query, custom-hmac-header
 *
 * Defaults to `bunny` so the inspector panel has something interesting
 * to show. All adapters are configured with FAKE hostnames/secrets —
 * the goal is to see what URLs and tokens the server emits, not to
 * actually hit a real edge.
 */
const cdnKind = (process.env['CLOUDPDF_SMOKE_CDN'] ?? 'bunny').toLowerCase();
const smokeSecretRefs = {
  jwtSigningSecret: { provider: 'env', name: 'CLOUDPDF_SMOKE_JWT_SECRET' },
  staticKmsKek: { provider: 'env', name: 'CLOUDPDF_SMOKE_STATIC_KMS_KEK', encoding: 'base64' },
} as const;
const smokeSecretsConfig = {
  providers: {
    env: { kind: 'env' },
  },
  cache: { ttlSec: 3600 },
} satisfies SecretsConfig;
const smokeKmsConfig = {
  kind: 'static',
  keyId: 'cloud-smoke-static',
  kek: smokeSecretRefs.staticKmsKek,
} satisfies KmsConfig;

const engineBaseUrl = `http://${host}:${enginePort}`;
const DEFAULT_DOC_SCOPE = [
  'doc.open',
  'doc.render',
  'doc.text.select',
  'doc.text.copy',
  'doc.annotate.read',
  'doc.annotate.modify',
  'doc.pages.assemble',
  'doc.download',
  'doc.download.flattened',
] as const;

let db: ReturnType<typeof createSqliteDb>;
let embedpdf: AppBundle;
let licenseRuntime: CloudPdfLicenseRuntime;
let storage: FsObjectStore;
let jwtSigningSecret: string;
let cdnSigner: CdnSigner;
let shares: SharesStore;

await startEmbedPdfServer();
shares = await SharesStore.open(`${dataRoot}/shares.json`);
await startApiServer();

async function startEmbedPdfServer(): Promise<void> {
  await mkdir(dataRoot, { recursive: true });
  await mkdir(`${dataRoot}/objects`, { recursive: true });
  await mkdir(`${dataRoot}/cache`, { recursive: true });

  db = createSqliteDb({ path: `${dataRoot}/cloudpdf.db` });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  licenseRuntime = await createLicenseRuntime({ db });
  const license = licenseRuntime.getStatus();
  if (license.access === 'none') {
    await licenseRuntime.close();
    await db.destroy();
    throw new Error(`${license.message} (${license.code})`);
  }
  storage = new FsObjectStore({ root: `${dataRoot}/objects` });
  const securityEnv = {
    ...process.env,
    CLOUDPDF_SMOKE_JWT_SECRET:
      process.env['CLOUDPDF_SMOKE_JWT_SECRET'] ?? 'cloudpdf-dev-secret-change-me',
    CLOUDPDF_SMOKE_STATIC_KMS_KEK: staticKmsKek,
  };
  const secrets = createSecretsProviderRegistry(smokeSecretsConfig, { env: securityEnv });
  const resolver = createSecretResolver(secrets);
  const [kms, resolvedSecrets] = await Promise.all([
    createKmsKeyring(smokeKmsConfig, { resolver }),
    resolver.resolve({
      jwtSecret: {
        ref: smokeSecretRefs.jwtSigningSecret,
        as: 'string',
      },
    }),
  ]);
  jwtSigningSecret = resolvedSecrets.jwtSecret;

  cdnSigner = buildSmokeCdnSigner(cdnKind);
  console.log(
    `[cloud-dashboard] CDN signer: ${cdnSigner.info.kind} ${JSON.stringify(cdnSigner.info)}`,
  );

  embedpdf = await buildApp({
    licenseGate: licenseRuntime,
    verifier: { mode: 'hs256', secret: jwtSigningSecret },
    kms,
    workerEntry: defaultWorkerEntryUrl,
    poolSize: 1,
    db,
    objectStore: storage,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: `${dataRoot}/cache`,
    cacheMaxBytes: 512 * 1024 * 1024,
    //cdnSigner,
  });
  await embedpdf.app.listen({ host, port: enginePort });
  console.log(`[cloud-dashboard] EmbedPDF server: ${engineBaseUrl}`);
}

/**
 * Build whatever CDN signer the operator asked for. Everything uses
 * fake/development credentials — the resulting tokens are deterministic
 * but won't actually validate against a real CDN edge. The point is to
 * SHOW the signed-URL shape in the inspector, not to authenticate.
 */
function buildSmokeCdnSigner(kind: string): CdnSigner {
  switch (kind) {
    case 'none':
      return new NoneCdnSigner();
    case 'bunny':
      return new BunnyCdnSigner({
        zoneHostname: 'embedpdf-smoke.b-cdn.net',
        zoneToken: 'smoke-bunny-zone-token-not-real',
      });
    case 'cloud-cdn':
      // 16-byte HMAC key for HMAC-SHA1 ('AAAA...' decoded from base64).
      return new CloudCdnSigner({
        urlPrefix: 'https://embedpdf-smoke.cdn.googleapis.com',
        keyName: 'smoke-key',
        keyValue: Buffer.alloc(16, 7).toString('base64'),
      });
    case 'cloudfront-cookies':
    case 'cloudfront-urls':
      // Generate an ephemeral RSA key per boot — production callers
      // load this from a SecretRef.
      return new CloudFrontCdnSigner({
        distributionDomain: 'd1smokeexample.cloudfront.net',
        keyPairId: 'KSMOKEPAIR000000',
        privateKeyPem: getOrGenerateRsaKey(),
        mode: kind === 'cloudfront-urls' ? 'urls' : 'cookies',
      });
    case 'azure-fd':
      return new AzureFrontDoorCdnSigner({
        endpoint: 'https://embedpdf-smoke.azurefd.net',
        secret: 'smoke-azure-fd-secret-not-real',
      });
    case 'custom-hmac-query':
      return new CustomHmacCdnSigner({
        cdnOrigin: 'https://cdn.smoke.example.com',
        secret: 'smoke-custom-hmac-secret',
        transport: 'query',
      });
    case 'custom-hmac-header':
      return new CustomHmacCdnSigner({
        cdnOrigin: 'https://cdn.smoke.example.com',
        secret: 'smoke-custom-hmac-secret',
        transport: 'header',
      });
    default:
      throw new Error(
        `Unknown CLOUDPDF_SMOKE_CDN=${kind}. Valid: none, bunny, cloud-cdn, cloudfront-cookies, cloudfront-urls, azure-fd, custom-hmac-query, custom-hmac-header.`,
      );
  }
}

let cachedRsaKey: string | null = null;
function getOrGenerateRsaKey(): string {
  if (cachedRsaKey) return cachedRsaKey;
  // Lazy import keeps node:crypto's generateKeyPairSync out of the
  // hot path when CloudFront isn't selected.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { generateKeyPairSync } = require('node:crypto') as typeof import('node:crypto');
  const { privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  cachedRsaKey = privateKey as string;
  return cachedRsaKey;
}

async function startApiServer(): Promise<void> {
  const server = createServer(async (req, res) => {
    try {
      await route(req, res);
    } catch (err) {
      sendJson(res, 500, {
        error: {
          message: err instanceof Error ? err.message : String(err),
          stack: process.env['NODE_ENV'] === 'production' ? undefined : (err as Error)?.stack,
        },
      });
    }
  });
  server.listen(apiPort, host, () => {
    console.log(`[cloud-dashboard] Admin helper: http://${host}:${apiPort}`);
  });

  const shutdown = async () => {
    server.close();
    await embedpdf.shutdown();
    await licenseRuntime.close();
    await db.destroy();
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown());
  process.on('SIGTERM', () => void shutdown());
}

async function route(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `${host}:${apiPort}`}`);
  if (req.method === 'GET' && url.pathname === '/api/config') {
    sendJson(res, 200, {
      tenantId: defaultTenant,
      // Displayed only. The browser reaches the engine same-origin through the
      // vite proxy, so the SDK runs with `baseUrl: ''`.
      originBaseUrl: engineBaseUrl,
      dataRoot,
      cdn: { kind: cdnKind, info: cdnSigner.info },
    });
    return;
  }

  // Mirror of /v1/access for the inspector — takes the doc token in the
  // body (instead of an Authorization header) and forwards through the
  // smoke server's own fetch, so the browser doesn't need to know
  // anything about the engine port or auth header shape.
  if (req.method === 'POST' && url.pathname === '/api/admin/access') {
    const body = (await readJson(req)) as Record<string, unknown>;
    const token = readString(body, 'token');
    const docId = readString(body, 'docId');
    const layerName = readString(body, 'layerName', 'default');
    const password = typeof body['password'] === 'string' ? (body['password'] as string) : null;
    const upstream = await fetch(`${engineBaseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        docId,
        layerName,
        ...(password ? { password } : {}),
      }),
    });
    const text = await upstream.text();
    let parsed: unknown = text;
    try {
      parsed = JSON.parse(text);
    } catch {
      // leave as raw text
    }
    sendJson(res, upstream.status, parsed);
    return;
  }

  // ── Documents ────────────────────────────────────────────────────────────

  if (req.method === 'GET' && url.pathname === '/api/documents') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    const [docs, counts] = [
      await adminForTenant(tenantId).documents.list({ limit: 100 }),
      shares.countByDoc(tenantId),
    ];
    sendJson(res, 200, {
      documents: docs.map((doc) => toDemoDocument(doc, counts.get(doc.id) ?? 0)),
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/documents') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    const fileName = decodeURIComponent(req.headers['x-file-name']?.toString() || 'upload.pdf');
    const bytes = await readBody(req);
    if (bytes.byteLength === 0) {
      sendJson(res, 400, { error: { message: 'empty upload body' } });
      return;
    }
    const created = await adminForTenant(tenantId).documents.create({
      bytes,
      metadata: { name: fileName, source: 'cloud-dashboard' },
      idempotencyKey: `demo-${tenantId}-${fileName}-${bytes.byteLength}-${Date.now()}`,
    });
    sendJson(res, 200, {
      document: toDemoDocument(created.document, 0),
      tag: created.tag,
    });
    return;
  }

  const docMatch = matchPath(url.pathname, '/api/documents/:id');
  if (docMatch && req.method === 'DELETE') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    await adminForTenant(tenantId).documents.delete(docMatch.id!);
    await shares.removeForDocument(tenantId, docMatch.id!);
    sendJson(res, 200, { ok: true });
    return;
  }

  // The warmed page-1 tile and the original bytes both live behind
  // TENANT-scoped admin routes, so the browser cannot fetch them directly —
  // it holds doc-scoped tokens only. Proxying here is what a real dashboard
  // backend does too.
  const thumbMatch = matchPath(url.pathname, '/api/documents/:id/thumbnail');
  if (thumbMatch && req.method === 'GET') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    await proxyAdminBinary(res, tenantId, `/v1/admin/documents/${thumbMatch.id}/thumbnail`);
    return;
  }

  const downloadMatch = matchPath(url.pathname, '/api/documents/:id/download');
  if (downloadMatch && req.method === 'GET') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    await proxyAdminBinary(res, tenantId, `/v1/admin/documents/${downloadMatch.id}/download`, {
      'content-disposition': `attachment; filename="${downloadMatch.id}.pdf"`,
    });
    return;
  }

  // ── Shares (the demo's stand-in for the integrator's sharing table) ───────

  if (req.method === 'GET' && url.pathname === '/api/shares') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    const docId = url.searchParams.get('docId') ?? undefined;
    sendJson(res, 200, { shares: shares.list(tenantId, docId) });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/shares') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    const body = (await readJson(req)) as Record<string, unknown>;
    const docId = readString(body, 'docId');
    const name = readString(body, 'name', 'Guest');
    const role = readString(body, 'role', 'custom');
    const layerName = readString(body, 'layerName', 'default');
    const ttlSeconds = readNumber(body, 'ttlSeconds', 3600);
    const scope = readStringArray(body, 'scope', [...DEFAULT_DOC_SCOPE]);
    const identity = readIdentityFromBody(body);
    const idempotencyKey =
      typeof body['idempotencyKey'] === 'string' ? (body['idempotencyKey'] as string) : undefined;
    const token = mintDocToken({
      tenantId,
      docId,
      layerName,
      sub: identity.user_id ?? name.toLowerCase().replace(/\s+/g, '-'),
      ttlSeconds,
      scope,
      identity,
    });
    const share = await shares.create({
      tenantId,
      docId,
      name,
      role,
      layerName,
      scope,
      identity,
      token,
      expiresAt: Date.now() + ttlSeconds * 1000,
      ...(idempotencyKey ? { idempotencyKey } : {}),
    });
    sendJson(res, 200, { share });
    return;
  }

  const shareMatch = matchPath(url.pathname, '/api/shares/:id');
  if (shareMatch && req.method === 'DELETE') {
    const tenantId = url.searchParams.get('tenantId') || defaultTenant;
    await shares.remove(tenantId, shareMatch.id!);
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/mint-token') {
    const body = await readJson(req);
    const tenantId = readString(body, 'tenantId', defaultTenant);
    const docId = readString(body, 'docId');
    const layerName = readString(body, 'layerName', 'default');
    const sub = readString(body, 'sub', 'demo-user');
    const ttlSeconds = readNumber(body, 'ttlSeconds', 3600);
    const scope = readStringArray(body, 'scope', [...DEFAULT_DOC_SCOPE]);
    const identity = readIdentityFromBody(body);
    const token = mintDocToken({ tenantId, docId, layerName, sub, ttlSeconds, scope, identity });
    sendJson(res, 200, { token, tenantId, docId, layerName, sub, ttlSeconds, scope, identity });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/admin/audit-export') {
    const body = await readJson(req);
    const tenantId = readString(body, 'tenantId', defaultTenant);
    const docId = readString(body, 'docId');
    const day = readString(body, 'day');
    const allowOpenDay = Boolean((body as Record<string, unknown>)['allowOpenDay']);
    const result = await new EventLogService({ storage }).exportDocDayJsonl(db, {
      tenantId,
      docId,
      day,
      allowOpenDay,
      force: Boolean((body as Record<string, unknown>)['force']),
    });
    sendJson(res, 200, result);
    return;
  }

  sendJson(res, 404, { error: { message: `not found: ${req.method} ${url.pathname}` } });
}

function adminForTenant(tenantId: string) {
  return createCloudAdmin({
    baseUrl: engineBaseUrl,
    tenantToken: tenantTokenFor(tenantId),
  });
}

function tenantTokenFor(tenantId: string): string {
  return signDevToken(jwtSigningSecret, {
    sub: 'cloud-dashboard-admin',
    tenant_id: tenantId,
    scope: ['*'] satisfies TenantScope[],
    ttlSeconds: 60 * 60,
  });
}

/**
 * Match `/api/documents/:id/thumbnail`-style patterns. Tiny by design — this
 * demo's router is a chain of ifs, and a regex builder would be more machinery
 * than the six routes justify.
 */
function matchPath(pathname: string, pattern: string): Record<string, string> | null {
  const actual = pathname.split('/').filter(Boolean);
  const expected = pattern.split('/').filter(Boolean);
  if (actual.length !== expected.length) return null;
  const params: Record<string, string> = {};
  for (const [i, segment] of expected.entries()) {
    const value = actual[i]!;
    if (segment.startsWith(':')) params[segment.slice(1)] = decodeURIComponent(value);
    else if (segment !== value) return null;
  }
  return params;
}

/** Stream an admin-scoped binary (thumbnail, original bytes) to the browser. */
async function proxyAdminBinary(
  res: ServerResponse,
  tenantId: string,
  path: string,
  extraHeaders: Record<string, string> = {},
): Promise<void> {
  const upstream = await fetch(`${engineBaseUrl}${path}`, {
    headers: { Authorization: `Bearer ${tenantTokenFor(tenantId)}` },
  });
  if (!upstream.ok) {
    // A `pending` thumbnail 404s until the ingest warm finishes — the
    // dashboard polls on that, so pass the status through untouched.
    sendJson(res, upstream.status, { error: { message: await upstream.text() } });
    return;
  }
  const body = Buffer.from(await upstream.arrayBuffer());
  res.writeHead(200, {
    'content-type': upstream.headers.get('content-type') ?? 'application/octet-stream',
    'content-length': body.byteLength,
    'cache-control': 'private, max-age=60',
    ...extraHeaders,
  });
  res.end(body);
}

/** Project an admin document record into the dashboard's own shape. */
function toDemoDocument(
  doc: {
    id: string;
    state: string;
    storageSizeBytes: number | null;
    metadata: Record<string, unknown> | null;
    createdAt: number;
    thumbnailState?: string;
  },
  shareCount: number,
) {
  const name = typeof doc.metadata?.['name'] === 'string' ? doc.metadata['name'] : doc.id;
  return {
    id: doc.id,
    state: doc.state,
    name,
    sizeBytes: doc.storageSizeBytes,
    createdAt: doc.createdAt,
    // Older servers omit the field; treat that as "no tile coming".
    thumbnailState: doc.thumbnailState ?? 'failed',
    shareCount,
  };
}

function mintDocToken(input: {
  tenantId: string;
  docId: string;
  layerName: string;
  sub: string;
  ttlSeconds?: number;
  scope?: ReadonlyArray<string>;
  identity?: {
    user_id?: string;
    group_id?: string;
    groups?: string[];
    display_name?: string;
  };
}): string {
  return signDevToken(jwtSigningSecret, {
    sub: input.sub,
    tenant_id: input.tenantId,
    doc_id: input.docId,
    layer_name: input.layerName,
    scope: input.scope && input.scope.length > 0 ? input.scope : DEFAULT_DOC_SCOPE,
    ttlSeconds: input.ttlSeconds ?? 60 * 60,
    jti: randomUUID(),
    extras: {
      ...(input.identity ?? {}),
      embedpdf: {
        unlock_key: randomBytes(32).toString('base64url'),
      },
    },
  });
}

async function readBody(req: IncomingMessage): Promise<Uint8Array> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const bytes = await readBody(req);
  return JSON.parse(Buffer.from(bytes).toString('utf8') || '{}') as unknown;
}

function readString(body: unknown, key: string, fallback?: string): string {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null;
  if (typeof value === 'string' && value.length > 0) {
    return value;
  }
  if (fallback !== undefined) {
    return fallback;
  }
  throw new Error(`missing string field: ${key}`);
}

function readStringArray(body: unknown, key: string, fallback: string[] = []): string[] {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null;
  if (Array.isArray(value)) {
    return value.map((item) => (typeof item === 'string' ? item.trim() : '')).filter(Boolean);
  }
  if (typeof value === 'string') return splitScopeList(value);
  return fallback;
}

function readIdentityFromBody(body: unknown): {
  user_id?: string;
  group_id?: string;
  groups?: string[];
  display_name?: string;
} {
  return {
    ...readOptionalString(body, 'user_id', 'user_id'),
    ...readOptionalString(body, 'group_id', 'group_id'),
    ...readOptionalString(body, 'display_name', 'display_name'),
    ...readOptionalStringArray(body, 'groups', 'groups'),
  };
}

function readOptionalString<T extends string>(
  body: unknown,
  key: string,
  outKey: T,
): Partial<Record<T, string>> {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null;
  return typeof value === 'string' && value.trim()
    ? ({ [outKey]: value.trim() } as Partial<Record<T, string>>)
    : {};
}

function readOptionalStringArray<T extends string>(
  body: unknown,
  key: string,
  outKey: T,
): Partial<Record<T, string[]>> {
  const values = readStringArray(body, key);
  return values.length > 0 ? ({ [outKey]: values } as Partial<Record<T, string[]>>) : {};
}

function splitScopeList(raw: string): string[] {
  return raw
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function readNumber(body: unknown, key: string, fallback: number): number {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[key] : null;
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const bytes = Buffer.from(JSON.stringify(body, null, 2));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': String(bytes.byteLength),
  });
  res.end(bytes);
}
