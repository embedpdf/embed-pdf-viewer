/**
 * documents.importFrom end-to-end: the server-side pull walked through
 * the real HTTP surface (auth → zod → lifecycle → storage → commit).
 *
 * A local stateful node:http server plays the customer's object
 * store; the bundle runs the dev/MinIO policy (allowHttp +
 * allowPrivateNetworks) so tests can pull from 127.0.0.1. Source URLs
 * always carry a fake presigned query string so every failure path
 * can assert the sanitization rule: the query string never appears in
 * responses or stored failure reasons.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { dirname, join as joinPath } from 'node:path';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { mockClient } from 'aws-sdk-client-mock';
import { sdkStreamMixin } from '@smithy/util-stream';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { Readable } from 'node:stream';

import { adminWirePaths } from '@cloudpdf/contract';
import {
  createSqliteDb,
  FsObjectStore,
  ImportConnectionSchema,
  ImportPolicySchema,
  migrate,
  signDevToken,
  sqliteMigrations,
  type AppBundle,
  type ImportConnection,
  type ImportPolicy,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const SECRET = 'import-e2e-secret';
const TENANT = 'imp-tenant';
const PDF = Buffer.from(`%PDF-1.7 import-e2e body ${'x'.repeat(512)}`);
const PDF_SHA = createHash('sha256').update(PDF).digest('hex');

let source: Server;
let sourcePort = 0;
const hits: string[] = [];
let flakyRemainingFailures = 1;

beforeAll(async () => {
  source = createServer((req, res) => {
    const url = req.url ?? '';
    hits.push(url);
    if (url.startsWith('/ok')) {
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': String(PDF.byteLength),
      });
      res.end(PDF);
      return;
    }
    if (url.startsWith('/missing')) {
      res.writeHead(404);
      res.end('nope');
      return;
    }
    if (url.startsWith('/flaky')) {
      res.writeHead(200, { 'content-length': String(PDF.byteLength) });
      if (flakyRemainingFailures > 0) {
        flakyRemainingFailures--;
        // Truncate mid-body: headers promised more than arrives.
        res.write(PDF.subarray(0, 64));
        setTimeout(() => res.destroy(), 5);
        return;
      }
      res.end(PDF);
      return;
    }
    res.writeHead(500);
    res.end('boom');
  });
  await new Promise<void>((resolve) => source.listen(0, '127.0.0.1', resolve));
  sourcePort = (source.address() as { port: number }).port;
});
afterAll(async () => {
  await new Promise<void>((resolve) => source.close(() => resolve()));
});

function srcUrl(path: string): string {
  return `http://127.0.0.1:${sourcePort}${path}?X-Sig=TOPSECRETSIG`;
}

interface Fixture {
  bundle: AppBundle;
  db: ReturnType<typeof createSqliteDb>;
  token: string;
  cleanup: () => Promise<void>;
}

const ROOT_API_TOKEN = 'import-e2e-root-token';

async function buildBundle(
  policy: Partial<ImportPolicy> = {},
  connections: ImportConnection[] = [],
): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-import-e2e-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: null,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    apiAuthTokens: [ROOT_API_TOKEN],
    importWorkerPollMs: 25,
    importPolicy: ImportPolicySchema.parse({
      allowHttp: true,
      allowPrivateNetworks: true,
      ...policy,
    }),
    importConnections: connections,
  });
  const token = signDevToken(SECRET, { sub: 'import-tester', tenant_id: TENANT, scope: ['*'] });
  return {
    bundle,
    db,
    token,
    cleanup: async () => {
      await bundle.shutdown();
      await db.destroy();
      await rm(storageRoot, { recursive: true, force: true });
    },
  };
}

describe('documents.importFrom E2E', () => {
  let fx: Fixture;

  beforeAll(async () => {
    fx = await buildBundle();
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  function importDoc(payload: unknown): ReturnType<typeof fx.bundle.app.inject> {
    return fx.bundle.app.inject({
      method: 'POST',
      url: adminWirePaths.documentsImport(TENANT),
      headers: { authorization: `Bearer ${fx.token}` },
      payload: payload as Record<string, unknown>,
    });
  }

  async function getDoc(docId: string): Promise<Record<string, any>> {
    const res = await fx.bundle.app.inject({
      method: 'GET',
      url: adminWirePaths.document(TENANT, docId),
      headers: { authorization: `Bearer ${fx.token}` },
    });
    expect(res.statusCode).toBe(200);
    return (JSON.parse(res.body) as { document: Record<string, any> }).document;
  }

  test('happy path: pulls, verifies, commits, and the bytes round-trip', async () => {
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      docId: 'imp-happy',
      metadata: { origin: 'e2e' },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { tag: string; document: Record<string, any> };
    expect(body.tag).toBe('imported');
    expect(body.document.state).toBe('ready');
    expect(body.document.baseSha).toBe(PDF_SHA);
    expect(body.document.storageSizeBytes).toBe(PDF.byteLength);

    const dl = await fx.bundle.app.inject({
      method: 'GET',
      url: adminWirePaths.documentDownload(TENANT, 'imp-happy'),
      headers: { authorization: `Bearer ${fx.token}` },
    });
    expect(dl.statusCode).toBe(200);
    expect(Buffer.from(dl.rawPayload)).toEqual(PDF);
  });

  test('declared sha256 pin mismatch fails terminally with cleaned bytes', async () => {
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      docId: 'imp-shapin',
      expected: { sha256: 'a'.repeat(64) },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('sha_mismatch');
    const doc = await getDoc('imp-shapin');
    expect(doc.state).toBe('failed');
    expect(doc.failureReason).toContain('sha_mismatch');
  });

  test('declared sizeBytes pin mismatch fails before transferring the body', async () => {
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      docId: 'imp-sizepin',
      expected: { sizeBytes: PDF.byteLength + 1 },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('size_mismatch');
    const doc = await getDoc('imp-sizepin');
    expect(doc.state).toBe('failed');
    expect(doc.failureReason).toContain('size_mismatch');
  });

  test('a 404 source fails terminally with a sanitized reason (no query string)', async () => {
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/missing') },
      docId: 'imp-missing',
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).not.toContain('TOPSECRETSIG');
    const doc = await getDoc('imp-missing');
    expect(doc.state).toBe('failed');
    expect(doc.failureReason).toContain('import_not_found');
    expect(doc.failureReason).not.toContain('TOPSECRETSIG');
    expect(doc.failureReason).not.toContain('X-Sig');
  });

  test('a truncated transfer is retryable: 502, row stays pending, same key resumes', async () => {
    const first = await importDoc({
      source: { kind: 'url', url: srcUrl('/flaky') },
      docId: 'imp-flaky',
      idempotencyKey: 'flaky-key-1',
    });
    expect(first.statusCode, first.body).toBe(502);
    expect((JSON.parse(first.body) as any).error.code).toBe('UpstreamError');
    const afterFail = await getDoc('imp-flaky');
    expect(afterFail.state).toBe('pending');

    const retry = await importDoc({
      source: { kind: 'url', url: srcUrl('/flaky') },
      idempotencyKey: 'flaky-key-1',
    });
    expect(retry.statusCode, retry.body).toBe(200);
    const body = JSON.parse(retry.body) as { tag: string; document: Record<string, any> };
    expect(body.tag).toBe('imported');
    expect(body.document.id).toBe('imp-flaky');
    expect(body.document.state).toBe('ready');
    expect(body.document.baseSha).toBe(PDF_SHA);
  });

  test('replaying a completed import with the same idempotency key dedupes without a transfer', async () => {
    const before = hits.filter((u) => u.startsWith('/flaky')).length;
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/flaky') },
      idempotencyKey: 'flaky-key-1',
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { tag: string; document: Record<string, any> };
    expect(body.tag).toBe('deduped');
    expect(body.document.id).toBe('imp-flaky');
    expect(hits.filter((u) => u.startsWith('/flaky')).length).toBe(before);
  });

  test('reuse-existing dedup with a declared sha skips the transfer entirely', async () => {
    const before = hits.filter((u) => u.startsWith('/ok')).length;
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      dedupMode: 'reuse-existing',
      expected: { sha256: PDF_SHA },
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { tag: string; document: Record<string, any> };
    expect(body.tag).toBe('deduped');
    expect(body.document.baseSha).toBe(PDF_SHA);
    expect(hits.filter((u) => u.startsWith('/ok')).length).toBe(before);
  });

  test('reuse-existing without expected.sha256 is a 400', async () => {
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      dedupMode: 'reuse-existing',
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('expected.sha256');
  });

  test('re-importing an existing docId without an idempotencyKey is an actionable 409', async () => {
    const first = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      docId: 'imp-dup-id',
    });
    expect(first.statusCode, first.body).toBe(200);

    const retry = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      docId: 'imp-dup-id',
    });
    expect(retry.statusCode, retry.body).toBe(409);
    const body = JSON.parse(retry.body) as { error: { code: string; message: string } };
    expect(body.error.code).toBe('Conflict');
    expect(body.error.message).toContain("document 'imp-dup-id' already exists");
    expect(body.error.message).toContain('idempotencyKey');
    expect(body.error.message).not.toContain('constraint');
  });

  test('a malformed body is a 400 with the schema error envelope', async () => {
    const res = await importDoc({ source: { kind: 'ftp', url: 'x' } });
    expect(res.statusCode, res.body).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('InvalidArg');
  });
});

describe('documents.importFrom disabled by policy', () => {
  test('answers 403 without touching the source', async () => {
    const fx = await buildBundle({ enabled: false });
    try {
      const before = hits.length;
      const res = await fx.bundle.app.inject({
        method: 'POST',
        url: adminWirePaths.documentsImport(TENANT),
        headers: { authorization: `Bearer ${fx.token}` },
        payload: { source: { kind: 'url', url: srcUrl('/ok') } },
      });
      expect(res.statusCode, res.body).toBe(403);
      expect(res.body).toContain('disabled');
      expect(hits.length).toBe(before);
    } finally {
      await fx.cleanup();
    }
  });
});

/**
 * Connection-source E2E: operator-registered S3 connections through
 * the real HTTP surface, with the S3 SDK command-mocked. Asserts the
 * credential-class gates, prefix scopes, and the document_imports
 * provenance rows (including sanitized locations and resolved
 * revisions).
 */
const s3Mock = mockClient(S3Client);

describe('documents.importFrom connection sources E2E', () => {
  const CONNECTIONS: ImportConnection[] = [
    // Whole bucket, defaults: api-token only — the client posture.
    ImportConnectionSchema.parse({
      kind: 's3',
      id: 'archive',
      bucket: 'conn-bucket',
      region: 'us-east-1',
    }),
    // Prefix-scoped and opted into tenant-jwt.
    ImportConnectionSchema.parse({
      kind: 's3',
      id: 'tenant-docs',
      bucket: 'conn-bucket',
      region: 'us-east-1',
      credentials: ['api-token', 'tenant-jwt'],
      scope: { kind: 'shared-prefixes', prefixes: ['docs/'] },
    }),
  ];

  let fx: Fixture;

  beforeAll(async () => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand).callsFake((input: { Key: string }) => {
      if (input.Key !== 'docs/e2e.pdf') {
        throw Object.assign(new Error('NoSuchKey'), {
          name: 'NoSuchKey',
          $metadata: { httpStatusCode: 404 },
        });
      }
      return {
        Body: sdkStreamMixin(Readable.from([PDF])),
        ContentLength: PDF.byteLength,
        ContentType: 'application/pdf',
        VersionId: 'v7',
      };
    });
    fx = await buildBundle({}, CONNECTIONS);
  });
  afterAll(async () => {
    await fx.cleanup();
    s3Mock.reset();
  });

  function importDoc(payload: unknown): ReturnType<typeof fx.bundle.app.inject> {
    return fx.bundle.app.inject({
      method: 'POST',
      url: adminWirePaths.documentsImport(TENANT),
      headers: { authorization: `Bearer ${fx.token}` },
      payload: payload as Record<string, unknown>,
    });
  }

  async function provenance(docId: string): Promise<Record<string, unknown> | undefined> {
    return fx.db
      .selectFrom('document_imports')
      .selectAll()
      .where('doc_id', '=', docId)
      .executeTakeFirst();
  }

  test('a prefix-scoped tenant-jwt connection imports and records provenance', async () => {
    const res = await importDoc({
      source: { kind: 'connection', connectionId: 'tenant-docs', key: 'docs/e2e.pdf' },
      docId: 'imp-conn-happy',
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { tag: string; document: Record<string, unknown> };
    expect(body.tag).toBe('imported');
    expect(body.document['state']).toBe('ready');
    expect(body.document['baseSha']).toBe(PDF_SHA);

    const row = await provenance('imp-conn-happy');
    expect(row).toMatchObject({
      state: 'succeeded',
      source_kind: 's3',
      connection_id: 'tenant-docs',
      source_location: 's3://conn-bucket/docs/e2e.pdf',
      resolved_revision: 'v7',
      via: 'tenant-jwt',
      requested_by: 'import-tester',
      attempts: 1,
    });
  });

  test('a whole-bucket connection stays api-token only', async () => {
    const res = await importDoc({
      source: { kind: 'connection', connectionId: 'archive', key: 'docs/e2e.pdf' },
      docId: 'imp-conn-cred',
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('not usable with tenant-jwt');
    const row = await provenance('imp-conn-cred');
    expect(row).toMatchObject({ state: 'failed' });
    expect(String(row?.['last_error'])).toContain('import_policy');
  });

  test('keys outside the connection scope are refused', async () => {
    const res = await importDoc({
      source: { kind: 'connection', connectionId: 'tenant-docs', key: 'private/e2e.pdf' },
      docId: 'imp-conn-scope',
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('outside the prefixes');
  });

  test('unknown connections are refused', async () => {
    const res = await importDoc({
      source: { kind: 'connection', connectionId: 'nope', key: 'docs/e2e.pdf' },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('unknown import connection');
  });

  test('url imports record sanitized provenance too', async () => {
    const res = await importDoc({
      source: { kind: 'url', url: srcUrl('/ok') },
      docId: 'imp-prov-url',
    });
    expect(res.statusCode, res.body).toBe(200);
    const row = await provenance('imp-prov-url');
    expect(row).toMatchObject({ state: 'succeeded', source_kind: 'url', connection_id: null });
    expect(String(row?.['source_location'])).toContain('/ok');
    expect(String(row?.['source_location'])).not.toContain('TOPSECRETSIG');
  });

  test('deleting a document cascades its provenance row', async () => {
    const del = await fx.bundle.app.inject({
      method: 'DELETE',
      url: adminWirePaths.document(TENANT, 'imp-prov-url'),
      headers: { authorization: `Bearer ${fx.token}` },
    });
    expect(del.statusCode).toBe(204);
    expect(await provenance('imp-prov-url')).toBeUndefined();
  });

  test('mode=async answers 202 and the in-process worker completes it', async () => {
    const res = await importDoc({
      source: { kind: 'connection', connectionId: 'tenant-docs', key: 'docs/e2e.pdf' },
      docId: 'imp-async',
      mode: 'async',
    });
    expect(res.statusCode, res.body).toBe(202);
    const body = JSON.parse(res.body) as { tag: string; document: Record<string, unknown> };
    expect(body.tag).toBe('accepted');
    expect(body.document['state']).toBe('pending');

    await vi.waitFor(
      async () => {
        const poll = await fx.bundle.app.inject({
          method: 'GET',
          url: adminWirePaths.document(TENANT, 'imp-async'),
          headers: { authorization: `Bearer ${fx.token}` },
        });
        const doc = (JSON.parse(poll.body) as { document: Record<string, unknown> }).document;
        expect(doc['state']).toBe('ready');
        expect(doc['baseSha']).toBe(PDF_SHA);
      },
      { timeout: 8000, interval: 100 },
    );

    const row = await provenance('imp-async');
    expect(row).toMatchObject({
      state: 'succeeded',
      connection_id: 'tenant-docs',
      resolved_revision: 'v7',
      via: 'tenant-jwt',
    });
  });

  test('url sources reject mode=async', async () => {
    const res = await importDoc({ source: { kind: 'url', url: srcUrl('/ok') }, mode: 'async' });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('requires a connection source');
  });
});

/**
 * Filesystem connection E2E — no SDK mocks: a real tmpdir plays the
 * operator's drop directory. Proves the structural api-token-only
 * rule end to end and the provenance trail for operator pulls.
 */
describe('documents.importFrom fs connection E2E', () => {
  let dropRoot: string;
  let fx: Fixture;

  beforeAll(async () => {
    dropRoot = await mkdtemp(join(tmpdir(), 'embedpdf-import-drop-'));
    const seeded = joinPath(dropRoot, 'inbox', 'scan-001.pdf');
    await mkdir(dirname(seeded), { recursive: true });
    await writeFile(seeded, PDF);
    fx = await buildBundle({}, [
      ImportConnectionSchema.parse({ kind: 'fs', id: 'local-drop', root: dropRoot }),
    ]);
  });
  afterAll(async () => {
    await fx.cleanup();
    await rm(dropRoot, { recursive: true, force: true });
  });

  function importVia(auth: string, payload: unknown): ReturnType<typeof fx.bundle.app.inject> {
    return fx.bundle.app.inject({
      method: 'POST',
      url: adminWirePaths.documentsImport(TENANT),
      headers: { authorization: `Bearer ${auth}` },
      payload: payload as Record<string, unknown>,
    });
  }

  test('tenant-jwt callers are refused structurally', async () => {
    const res = await importVia(fx.token, {
      source: { kind: 'connection', connectionId: 'local-drop', key: 'inbox/scan-001.pdf' },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('not usable with tenant-jwt');
  });

  test('the operator api-token imports from the drop directory', async () => {
    const res = await importVia(ROOT_API_TOKEN, {
      source: { kind: 'connection', connectionId: 'local-drop', key: 'inbox/scan-001.pdf' },
      docId: 'imp-fs-happy',
    });
    expect(res.statusCode, res.body).toBe(200);
    const body = JSON.parse(res.body) as { tag: string; document: Record<string, unknown> };
    expect(body.tag).toBe('imported');
    expect(body.document['state']).toBe('ready');
    expect(body.document['baseSha']).toBe(PDF_SHA);

    const row = await fx.db
      .selectFrom('document_imports')
      .selectAll()
      .where('doc_id', '=', 'imp-fs-happy')
      .executeTakeFirst();
    expect(row).toMatchObject({
      state: 'succeeded',
      source_kind: 'fs',
      connection_id: 'local-drop',
      via: 'api-token',
      requested_by: 'api-token',
      resolved_revision: null,
    });
    expect(String(row?.['source_location'])).toContain('inbox/scan-001.pdf');
  });

  test('mode=async on fs without expected.sha256 is refused with the pinning hint', async () => {
    const res = await importVia(ROOT_API_TOKEN, {
      source: { kind: 'connection', connectionId: 'local-drop', key: 'inbox/scan-001.pdf' },
      mode: 'async',
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('async imports from fs require expected.sha256');
  });

  test('a revision on an fs connection is refused with the sha256 hint', async () => {
    const res = await importVia(ROOT_API_TOKEN, {
      source: { kind: 'connection', connectionId: 'local-drop', key: 'inbox/scan-001.pdf', revision: 'v1' },
    });
    expect(res.statusCode, res.body).toBe(400);
    expect(res.body).toContain('expected.sha256');
  });
});
