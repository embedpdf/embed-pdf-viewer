/**
 * documents.import end-to-end: the server-side pull walked through
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
import { mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { adminWirePaths } from '@cloudpdf/contract';
import {
  createSqliteDb,
  FsObjectStore,
  ImportPolicySchema,
  migrate,
  signDevToken,
  sqliteMigrations,
  type AppBundle,
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
  token: string;
  cleanup: () => Promise<void>;
}

async function buildBundle(policy: Partial<ImportPolicy> = {}): Promise<Fixture> {
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
    importPolicy: ImportPolicySchema.parse({
      allowHttp: true,
      allowPrivateNetworks: true,
      ...policy,
    }),
  });
  const token = signDevToken(SECRET, { sub: 'import-tester', tenant_id: TENANT, scope: ['*'] });
  return {
    bundle,
    token,
    cleanup: async () => {
      await bundle.shutdown();
      await db.destroy();
      await rm(storageRoot, { recursive: true, force: true });
    },
  };
}

describe('documents.import E2E', () => {
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

  test('a malformed body is a 400 with the schema error envelope', async () => {
    const res = await importDoc({ source: { kind: 'ftp', url: 'x' } });
    expect(res.statusCode, res.body).toBe(400);
    const body = JSON.parse(res.body) as { error: { code: string } };
    expect(body.error.code).toBe('InvalidArg');
  });
});

describe('documents.import disabled by policy', () => {
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
