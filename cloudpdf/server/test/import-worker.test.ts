/**
 * Async import worker (phase 3b): deterministic single-poll tests of
 * the claim loop against a real sqlite + FsObjectStore lifecycle.
 * Covers the six correctness requirements — fenced transitions,
 * reconcile-on-claim, exhausted-retryable document failure, atomic
 * doc+job creation, and (via the sweeper test) job ownership of
 * pending documents.
 */
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { DocumentImportsRepo } from '../src/db/repos/document_imports.repo';
import { DocumentsRepo } from '../src/db/repos/documents.repo';
import { TenantsRepo } from '../src/db/repos/tenants.repo';
import {
  createSqliteDb,
  FsObjectStore,
  ImportConnectionRegistry,
  ImportConnectionSchema,
  ImportPolicySchema,
  ImportWorker,
  migrate,
  sqliteMigrations,
} from '../src/index';
import { DocumentLifecycleService } from '../src/services/DocumentLifecycleService';

const TENANT = 'wrk-tenant';
const PDF = Buffer.from(`%PDF-1.7 worker body ${'y'.repeat(256)}`);
const PDF_SHA = createHash('sha256').update(PDF).digest('hex');
const OTHER_SHA = 'a'.repeat(64);

let db: ReturnType<typeof createSqliteDb>;
let storageRoot: string;
let dropRoot: string;
let documents: DocumentsRepo;
let jobs: DocumentImportsRepo;
let lifecycle: DocumentLifecycleService;
let worker: ImportWorker;

beforeEach(async () => {
  db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-wrk-store-'));
  dropRoot = await mkdtemp(join(tmpdir(), 'embedpdf-wrk-drop-'));
  const seeded = join(dropRoot, 'inbox', 'a.pdf');
  await mkdir(dirname(seeded), { recursive: true });
  await writeFile(seeded, PDF);

  const storage = new FsObjectStore({ root: storageRoot });
  documents = new DocumentsRepo(db);
  jobs = new DocumentImportsRepo(db);
  const policy = ImportPolicySchema.parse({});
  lifecycle = new DocumentLifecycleService({
    documents,
    tenants: new TenantsRepo(db),
    storage,
    autoProvisionTenant: true,
    importPolicy: policy,
    importConnections: new ImportConnectionRegistry([
      ImportConnectionSchema.parse({ kind: 'fs', id: 'drop', root: dropRoot }),
      // A connection whose root does not exist: opens fail RETRYABLY.
      ImportConnectionSchema.parse({ kind: 'fs', id: 'ghost', root: join(dropRoot, 'not-there') }),
    ]),
    documentImports: jobs,
    db,
  });
  worker = new ImportWorker({
    jobs,
    documents,
    lifecycle,
    storage,
    policy,
  });
});
afterEach(async () => {
  await db.destroy();
  await rm(storageRoot, { recursive: true, force: true });
  await rm(dropRoot, { recursive: true, force: true });
});

function enqueue(overrides: Record<string, unknown> = {}): ReturnType<typeof lifecycle.importFromSource> {
  return lifecycle.importFromSource({
    tenantId: TENANT,
    sub: 'op',
    via: 'api-token',
    mode: 'async',
    source: { kind: 'connection', connectionId: 'drop', key: 'inbox/a.pdf' },
    expected: { sha256: PDF_SHA },
    ...(overrides as object),
  } as Parameters<typeof lifecycle.importFromSource>[0]);
}

describe('async enqueue', () => {
  test('creates the pending document and the queued job atomically', async () => {
    const res = await enqueue({ docId: 'wrk-a' });
    expect(res.tag).toBe('accepted');
    expect(res.doc.state).toBe('pending');
    const job = await jobs.findByDoc('wrk-a', TENANT);
    expect(job).toMatchObject({ state: 'queued', attempts: 0, connectionId: 'drop' });
    expect(JSON.parse(job!.sourceJson!)).toMatchObject({ kind: 'connection', key: 'inbox/a.pdf' });
  });

  test('url sources and sha-less fs sources are rejected up front', async () => {
    await expect(
      enqueue({ source: { kind: 'url', url: 'https://example.com/a.pdf' } }),
    ).rejects.toThrow(/requires a connection source/);
    await expect(enqueue({ expected: undefined })).rejects.toThrow(/expected\.sha256/);
  });

  test('a live job blocks a concurrent sync re-drive of the same key', async () => {
    await enqueue({ docId: 'wrk-race', idempotencyKey: 'k-race' });
    await expect(
      lifecycle.importFromSource({
        tenantId: TENANT,
        sub: 'op',
        via: 'api-token',
        mode: 'sync',
        source: { kind: 'connection', connectionId: 'drop', key: 'inbox/a.pdf' },
        expected: { sha256: PDF_SHA },
        idempotencyKey: 'k-race',
      }),
    ).rejects.toThrow(/async import is in progress/);
  });
});

describe('worker poll', () => {
  test('transfers, commits, and records the fenced success', async () => {
    await enqueue({ docId: 'wrk-happy' });
    expect(await worker.poll()).toBe('processed');
    const doc = await documents.findById('wrk-happy');
    expect(doc?.state).toBe('ready');
    expect(doc?.baseSha).toBe(PDF_SHA);
    const job = await jobs.findByDoc('wrk-happy', TENANT);
    expect(job).toMatchObject({ state: 'succeeded', attempts: 1, lastError: null, sourceKind: 'fs' });
    expect(await worker.poll()).toBe('idle');
  });

  test('terminal source failures fail the job AND the document', async () => {
    await enqueue({
      docId: 'wrk-404',
      source: { kind: 'connection', connectionId: 'drop', key: 'inbox/gone.pdf' },
      expected: { sha256: OTHER_SHA },
    });
    expect(await worker.poll()).toBe('processed');
    expect((await documents.findById('wrk-404'))?.state).toBe('failed');
    const job = await jobs.findByDoc('wrk-404', TENANT);
    expect(job?.state).toBe('failed');
    expect(job?.lastError).toContain('not found');
  });

  test('retryable failures requeue with backoff and leave the document pending', async () => {
    await enqueue({
      docId: 'wrk-retry',
      source: { kind: 'connection', connectionId: 'ghost', key: 'inbox/a.pdf' },
      expected: { sha256: PDF_SHA },
    });
    expect(await worker.poll()).toBe('processed');
    const job = await jobs.findByDoc('wrk-retry', TENANT);
    expect(job).toMatchObject({ state: 'queued', attempts: 1 });
    expect(job!.nextAttemptAt).toBeGreaterThan(Date.now());
    expect((await documents.findById('wrk-retry'))?.state).toBe('pending');
    // Backoff respected: nothing claimable yet.
    expect(await worker.poll()).toBe('idle');
  });

  test('exhausted retryables explicitly fail the document', async () => {
    await enqueue({
      docId: 'wrk-exhaust',
      source: { kind: 'connection', connectionId: 'ghost', key: 'inbox/a.pdf' },
      expected: { sha256: PDF_SHA },
    });
    await db
      .updateTable('document_imports')
      .set({ attempts: 4, next_attempt_at: 1 })
      .where('doc_id', '=', 'wrk-exhaust')
      .execute();
    expect(await worker.poll()).toBe('processed');
    const doc = await documents.findById('wrk-exhaust');
    expect(doc?.state).toBe('failed');
    expect(doc?.failureReason).toContain('import_retries_exhausted');
    const job = await jobs.findByDoc('wrk-exhaust', TENANT);
    expect(job?.state).toBe('failed');
    expect(job?.lastError).toContain('retries exhausted');
  });

  test('reconcile-on-claim: a ready document succeeds the job without a transfer', async () => {
    // Sync import completes the document…
    const sync = await lifecycle.importFromSource({
      tenantId: TENANT,
      sub: 'op',
      via: 'api-token',
      source: { kind: 'connection', connectionId: 'drop', key: 'inbox/a.pdf' },
    });
    expect(sync.tag).toBe('imported');
    // …then a queued job appears pointing at a MISSING file: only the
    // reconcile path (no transfer) can succeed it.
    await jobs.enqueue({
      docId: sync.doc.id,
      tenantId: TENANT,
      sourceKind: 'connection',
      connectionId: 'drop',
      sourceLocation: 'connection:drop/inbox/does-not-exist.pdf',
      requestedRevision: null,
      expectedSha256: null,
      expectedSizeBytes: null,
      requestedBy: 'op',
      via: 'api-token',
      sourceJson: JSON.stringify({
        kind: 'connection',
        connectionId: 'drop',
        key: 'inbox/does-not-exist.pdf',
      }),
    });
    expect(await worker.poll()).toBe('processed');
    const job = await jobs.findByDoc(sync.doc.id, TENANT);
    expect(job?.state).toBe('succeeded');
    expect((await documents.findById(sync.doc.id))?.state).toBe('ready');
  });
});

describe('fencing', () => {
  test('a stale lease token cannot overwrite its replacement', async () => {
    await enqueue({ docId: 'wrk-fence' });
    const first = await jobs.claimNext('w1', 60_000);
    expect(first?.leaseToken).toBeTruthy();
    // Lease expires; a second worker re-claims.
    await db
      .updateTable('document_imports')
      .set({ lease_expires_at: 1 })
      .where('doc_id', '=', 'wrk-fence')
      .execute();
    const second = await jobs.claimNext('w2', 60_000);
    expect(second?.leaseToken).toBeTruthy();
    expect(second?.attempts).toBe(2);
    // The stale holder's transitions are no-ops.
    expect(await jobs.succeed(first!.id, first!.leaseToken!, { resolvedRevision: null })).toBe(false);
    expect(await jobs.failJob(first!.id, first!.leaseToken!, 'stale')).toBe(false);
    const row = await jobs.findByDoc('wrk-fence', TENANT);
    expect(row).toMatchObject({ state: 'running', leaseOwner: 'w2' });
    // The live holder's transition lands.
    expect(await jobs.succeed(second!.id, second!.leaseToken!, { resolvedRevision: null })).toBe(true);
  });
});

describe('sweeper ownership', () => {
  test('queued jobs shield their pending documents from the sweeper', async () => {
    await enqueue({
      docId: 'wrk-sweep',
      source: { kind: 'connection', connectionId: 'ghost', key: 'inbox/a.pdf' },
      expected: { sha256: PDF_SHA },
    });
    await db.updateTable('documents').set({ updated_at: 1 }).where('id', '=', 'wrk-sweep').execute();
    expect(await lifecycle.sweepStalePending({ olderThanMs: 1000 })).toBe(0);
    expect(await documents.findById('wrk-sweep')).not.toBeNull();
    // Once the job is terminal, the sweeper may reap the abandoned pending.
    await db
      .updateTable('document_imports')
      .set({ state: 'failed' })
      .where('doc_id', '=', 'wrk-sweep')
      .execute();
    expect(await lifecycle.sweepStalePending({ olderThanMs: 1000 })).toBe(1);
    expect(await documents.findById('wrk-sweep')).toBeNull();
  });
});
