import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  StaticKmsKeyring,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * Step 4 of the auth model: the API token on the doc plane. The hook
 * synthesizes a tenant-mode principal from the DOCUMENT'S OWN tenant,
 * so every existing guard passes unchanged; mutations flow through the
 * same routes viewers use (audit → SSE → version bumps); encrypted
 * documents unlock per-request via X-Document-Password (base64,
 * API-token only); /v1/access and /v1/warm stay JWT-only.
 */

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'doc-plane-api-secret';
const RETIRING_API_TOKEN = 'doc-plane-retiring-root-token';
const API_TOKEN = 'doc-plane-root-token';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

let fx: Fixture;

beforeAll(async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'doc-plane-api-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'doc-plane-api-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    // Exercise overlap rotation: requests below use the second candidate.
    apiAuthTokens: [RETIRING_API_TOKEN, API_TOKEN],
    workerEntry: STUB_ENTRY,
    poolSize: 2,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    kms: new StaticKmsKeyring({
      keyId: 'test-password-session-kek',
      kek: Buffer.alloc(32, 7),
    }),
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  fx = { bundle, app: bundle.app, db, baseUrl, storageRoot, cacheRoot };
});

afterAll(async () => {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
});

function apiHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return { Authorization: `Bearer ${API_TOKEN}`, ...extra };
}

function passwordHeader(password: string): Record<string, string> {
  return { 'X-Document-Password': Buffer.from(password, 'utf8').toString('base64') };
}

function docToken(tenantId: string, docId: string, opts: { layer?: string } = {}): string {
  return signDevToken(SECRET, {
    sub: 'viewer-1',
    tenant_id: tenantId,
    doc_id: docId,
    scope: ['*'],
    ...(opts.layer ? { layer_name: opts.layer } : {}),
    jti: `jti-${randomBytes(8).toString('hex')}`,
    extras: { embedpdf: { unlock_key: randomBytes(32).toString('base64url') } },
  });
}

async function seedDocument(
  tenantId: string,
  docId: string,
  opts: {
    pageCount?: number;
    security?: {
      encryptionState: 'unknown' | 'none' | 'encrypted' | 'unsupported';
      encryptionRequiresPassword: boolean | null;
      securityHandlerRevision?: number | null;
    };
  } = {},
): Promise<void> {
  const pageCount = opts.pageCount ?? 3;
  const padding = randomBytes(4095);
  const bytes = new Uint8Array(4096);
  bytes[0] = pageCount;
  bytes.set(padding, 1);
  const sha = createHash('sha256').update(bytes).digest('hex');

  const storage = new FsObjectStore({ root: fx.storageRoot });
  await storage.put(StorageKeys.basePdf(tenantId, docId), bytes, {
    contentLength: bytes.byteLength,
  });

  await fx.db
    .insertInto('tenants')
    .values({ id: tenantId, name: tenantId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: tenantId,
      state: 'ready',
      base_sha: sha,
      storage_size_bytes: bytes.byteLength,
      ...(opts.security
        ? {
            encryption_state: opts.security.encryptionState,
            encryption_requires_password:
              opts.security.encryptionRequiresPassword === null
                ? null
                : opts.security.encryptionRequiresPassword
                  ? 1
                  : 0,
            security_handler_revision: opts.security.securityHandlerRevision ?? null,
            security_probed_at: now,
          }
        : {}),
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
}

function highlightDraft(): unknown {
  return {
    subtype: 'highlight',
    quadPoints: [
      {
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        p3: { x: 0, y: 10 },
        p4: { x: 10, y: 10 },
      },
    ],
  };
}

describe('API token on the doc plane', () => {
  test('plain reads resolve the tenant from the document', async () => {
    await seedDocument('api-read-t', 'docapiread1');

    const head = await fetch(`${fx.baseUrl}/v1/docs/docapiread1/head`, {
      headers: apiHeaders(),
    });
    expect(head.status, await head.clone().text()).toBe(200);

    const manifest = await fetch(`${fx.baseUrl}/v1/docs/docapiread1/manifest`, {
      headers: apiHeaders(),
    });
    expect(manifest.status).toBe(200);
    const body = (await manifest.json()) as { pages?: unknown[] };
    expect(Array.isArray(body.pages)).toBe(true);

    const annotations = await fetch(
      `${fx.baseUrl}/v1/docs/docapiread1/layers/reviews/annotations/items`,
      { headers: apiHeaders() },
    );
    expect(annotations.status, await annotations.clone().text()).toBe(200);
    expect(annotations.headers.get('cache-control')).toContain('no-store');
    const annotationBody = (await annotations.json()) as {
      pages?: unknown[];
      auditHead?: number;
    };
    expect(annotationBody.pages).toHaveLength(3);
    expect(annotationBody.auditHead).toEqual(expect.any(Number));
  });

  test('a nonexistent document is a clean 404 from the resolution hook', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/no-such-doc/head`, {
      headers: apiHeaders(),
    });
    expect(res.status).toBe(404);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('NotFound');
  });

  test('mutations ride the shared path: audit actor, version bump, SSE fan-out', async () => {
    const tenantId = 'api-mut-t';
    const docId = 'docapimut1';
    await seedDocument(tenantId, docId);

    // A viewer subscribes to the layer event stream first.
    const subscriber = new AbortController();
    const eventsRes = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/reviews/events`, {
      headers: { Authorization: `Bearer ${docToken(tenantId, docId, { layer: 'reviews' })}` },
      signal: subscriber.signal,
    });
    expect(eventsRes.status).toBe(200);
    const reader = eventsRes.body!.getReader();
    const sawMutation = (async () => {
      const decoder = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return false;
        buffer += decoder.decode(value, { stream: true });
        if (buffer.includes('event: mutation')) return true;
      }
    })();

    // The API token mutates through the same route a viewer would use.
    const create = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/reviews/annotations/pages/1/items`,
      {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify(highlightDraft()),
      },
    );
    expect(create.status, await create.clone().text()).toBe(200);
    const created = (await create.json()) as {
      meta: { cacheDelta: { previousDocVersion: number; docVersion: number } };
    };
    expect(created.meta.cacheDelta.docVersion).toBeGreaterThan(
      created.meta.cacheDelta.previousDocVersion,
    );

    const audit = await fx.db
      .selectFrom('audit_log')
      .selectAll()
      .where('doc_id', '=', docId)
      .orderBy('id', 'desc')
      .executeTakeFirst();
    expect(audit?.sub).toBe('api-token');
    expect(audit?.kind).toBe('annot.create');

    const observed = await Promise.race([
      sawMutation,
      new Promise<false>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
    subscriber.abort();
    expect(observed, 'viewer SSE stream should observe the api-token mutation').toBe(true);
  });

  test('viewer-session bootstrap stays JWT-only', async () => {
    for (const path of ['/v1/access', '/v1/warm']) {
      const res = await fetch(`${fx.baseUrl}${path}`, {
        method: 'POST',
        headers: apiHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ docId: 'whatever' }),
      });
      expect(res.status, path).toBe(403);
      const body = (await res.json()) as { error?: { message?: string } };
      expect(body.error?.message).toMatch(/mint a doc token/);
    }
  });
});

describe('X-Document-Password (API token only)', () => {
  const tenantId = 'api-enc-t';
  const docId = 'docapienc1';

  beforeAll(async () => {
    for (const id of [docId, `${docId}-cold`]) {
      await seedDocument(tenantId, id, {
        security: {
          encryptionState: 'encrypted',
          encryptionRequiresPassword: true,
          securityHandlerRevision: 6,
        },
      });
    }
  });

  test('without the header, an encrypted doc asks for it', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: apiHeaders(),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string; message?: string } };
    expect(body.error?.code).toBe('DocPasswordRequired');
    expect(body.error?.message).toMatch(/X-Document-Password/);
  });

  test('a verified password authorizes warm base and layer reads without a JWT session', async () => {
    const headers = apiHeaders(passwordHeader('Test'));
    const first = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, { headers });
    expect(first.status, await first.clone().text()).toBe(200);

    // Regression: the old warm-head path switched back to the JWT-bound
    // password-session table, which an API token can never populate.
    const second = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, { headers });
    expect(second.status, await second.clone().text()).toBe(200);

    // Layer paths used to assert a JWT session before they reached the
    // per-request API password.
    const layer = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/reviews/manifest`, {
      headers,
    });
    expect(layer.status, await layer.clone().text()).toBe(200);

    const proof = await fx.db
      .selectFrom('pdf_password_verifications')
      .select(['opened_as', 'pdf_permissions_bits'])
      .where('doc_id', '=', docId)
      .executeTakeFirst();
    expect(proof).toMatchObject({ opened_as: 'user', pdf_permissions_bits: 0xfffff0c0 });
  });

  test('the header password is threaded to a cold open', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}-cold/manifest`, {
      headers: apiHeaders(passwordHeader('Test')),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  test('a wrong password is checked against an already-open document', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: apiHeaders(passwordHeader('api-wrong-password')),
    });
    expect(res.status).toBe(422);
    const body = (await res.json()) as { error?: { code?: string } };
    expect(body.error?.code).toBe('DocPasswordIncorrect');
  });

  test('singleflight shares availability, never another caller password authorization', async () => {
    const raceDocId = 'docapisingleflight';
    await seedDocument(tenantId, raceDocId, {
      security: {
        encryptionState: 'encrypted',
        encryptionRequiresPassword: true,
        securityHandlerRevision: 6,
      },
    });

    const correctRequest = fetch(`${fx.baseUrl}/v1/docs/${raceDocId}/manifest`, {
      headers: apiHeaders(passwordHeader('Test')),
    });
    const service = fx.bundle.documentService;
    if (!service) throw new Error('document service was not constructed');
    const deadline = Date.now() + 2_000;
    while (service.stats().inflightOpens === 0 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    expect(service.stats().inflightOpens).toBe(1);

    const wrongRequest = fetch(`${fx.baseUrl}/v1/docs/${raceDocId}/manifest`, {
      headers: apiHeaders(passwordHeader('api-wrong-password')),
    });
    const [correct, wrong] = await Promise.all([correctRequest, wrongRequest]);
    expect(correct.status, await correct.clone().text()).toBe(200);
    expect(wrong.status).toBe(422);
    const wrongBody = (await wrong.json()) as { error?: { code?: string } };
    expect(wrongBody.error?.code).toBe('DocPasswordIncorrect');
  });

  test('malformed base64 is rejected before any document work', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: apiHeaders({ 'X-Document-Password': '!!!not-base64!!!' }),
    });
    expect(res.status).toBe(400);
  });

  test('unpadded base64 remains accepted', async () => {
    const encoded = Buffer.from('Test', 'utf8').toString('base64').slice(0, -2);
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: apiHeaders({ 'X-Document-Password': encoded }),
    });
    expect(res.status, await res.clone().text()).toBe(200);
  });

  test.each(['VGVzdA=', 'VGVzdA===', 'VG=VzdA=='])(
    'invalid base64 padding is rejected: %s',
    async (encoded) => {
      const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
        headers: apiHeaders({ 'X-Document-Password': encoded }),
      });
      expect(res.status).toBe(400);
    },
  );

  test('an oversized password header is rejected before decoding', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: apiHeaders({ 'X-Document-Password': 'A'.repeat(4_097) }),
    });
    expect(res.status).toBe(400);
  });

  test('base64 that decodes to malformed UTF-8 is rejected', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/manifest`, {
      headers: apiHeaders({
        'X-Document-Password': Buffer.from([0xc3, 0x28]).toString('base64'),
      }),
    });
    expect(res.status).toBe(400);
  });

  test('the header is refused entirely without the api token', async () => {
    const viewer = docToken(tenantId, docId);
    const onDocPlane = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
      headers: {
        Authorization: `Bearer ${viewer}`,
        ...passwordHeader('Test'),
      },
    });
    expect(onDocPlane.status).toBe(403);
    const body = (await onDocPlane.json()) as { error?: { message?: string } };
    expect(body.error?.message).toMatch(/requires the api token/);
  });
});
