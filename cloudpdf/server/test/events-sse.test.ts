import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { InProcessRealtimeBus } from '../src/realtime/RealtimeBus';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'events-sse-secret';

interface Fixture {
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
  bus: InProcessRealtimeBus;
}

interface SseEvent {
  id: number | null;
  event: string;
  data: string;
}

/** Minimal test-side SSE consumer: collects parsed events from a fetch body. */
class SseCollector {
  readonly events: SseEvent[] = [];
  private buffer = '';
  private readonly waiters: Array<() => void> = [];
  private readonly abort = new AbortController();
  private done: Promise<void> | null = null;

  async open(url: string, token: string, lastEventId?: number): Promise<void> {
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
        ...(lastEventId !== undefined ? { 'Last-Event-ID': String(lastEventId) } : {}),
      },
      signal: this.abort.signal,
    });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    this.done = (async () => {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        this.buffer += decoder.decode(value, { stream: true });
        this.parse();
      }
    })().catch(() => undefined);
  }

  /** Wait until `count` events have arrived (10s safety timeout). */
  async waitFor(count: number): Promise<void> {
    const deadline = Date.now() + 10_000;
    while (this.events.length < count) {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${count} events (got ${this.events.length})`);
      }
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 50);
      });
    }
  }

  async close(): Promise<void> {
    this.abort.abort();
    await this.done;
  }

  /** Resolves when the server ends the stream (reader sees done). */
  async waitForEnd(): Promise<void> {
    await this.done;
  }

  private parse(): void {
    for (;;) {
      const sep = this.buffer.indexOf('\n\n');
      if (sep < 0) return;
      const block = this.buffer.slice(0, sep);
      this.buffer = this.buffer.slice(sep + 2);
      if (block.startsWith(':')) continue; // comment / heartbeat
      let id: number | null = null;
      let event = 'message';
      const data: string[] = [];
      for (const line of block.split('\n')) {
        if (line.startsWith('id:')) id = Number(line.slice(3).trim());
        else if (line.startsWith('event:')) event = line.slice(6).trim();
        else if (line.startsWith('data:')) data.push(line.slice(5).trim());
      }
      this.events.push({ id, event, data: data.join('\n') });
      for (const waiter of this.waiters.splice(0)) waiter();
    }
  }
}

describe('GET /events — the SSE half of the document event stream', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await buildFixture();
  });

  afterEach(async () => {
    await tearDown(fx);
  });

  test('a mutation is streamed live, payload identical to the HTTP response', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docsse001';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const token = docToken(tenantId, docId, layerName);

    const sse = new SseCollector();
    await sse.open(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`, token);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'X-Engine-Session-Id': 'engine-session-A',
      },
      body: JSON.stringify({ pageObjectNumbers: [1], rotation: 90 }),
    });
    expect(res.status).toBe(200);
    const responseBody = (await res.json()) as unknown;

    await sse.waitFor(1);
    const [event] = sse.events;
    expect(event.event).toBe('mutation');
    expect(typeof event.id).toBe('number');
    const row = JSON.parse(event.data) as {
      kind: string;
      originSessionId: string | null;
      payload: unknown;
      layerName: string;
    };
    expect(row.kind).toBe('pages.rotate');
    expect(row.layerName).toBe(layerName);
    expect(row.originSessionId).toBe('engine-session-A');
    // The streamed payload IS the mutating caller's response — the
    // three-way identity (response = audit payload = event payload).
    expect(row.payload).toEqual(responseBody);
    await sse.close();
  });

  test('the hijacked SSE response preserves wildcard CORS headers', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docssecors';
    const layerName = 'alice';
    const origin = 'https://customer.example';
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });

    const abort = new AbortController();
    try {
      const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`, {
        headers: {
          Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
          Accept: 'text/event-stream',
          Origin: origin,
        },
        signal: abort.signal,
      });
      expect(res.status).toBe(200);
      expect(res.headers.get('access-control-allow-origin')).toBe(origin);
      expect(res.headers.get('vary')).toContain('Origin');
    } finally {
      abort.abort();
    }
  });

  test('Last-Event-ID resumes exactly: only rows past the cursor are replayed', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docsse002';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const token = docToken(tenantId, docId, layerName);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    // Two mutations BEFORE any subscriber exists.
    const first = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [1], rotation: 90 }),
    });
    expect(first.status).toBe(200);
    const second = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/move`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [3], destIndex: 0 }),
    });
    expect(second.status).toBe(200);

    // Resume from cursor 1 → only the second mutation replays.
    const sse = new SseCollector();
    await sse.open(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`, token, 1);
    await sse.waitFor(1);
    expect(sse.events).toHaveLength(1);
    expect(sse.events[0].id).toBe(2);
    expect((JSON.parse(sse.events[0].data) as { kind: string }).kind).toBe('pages.move');
    await sse.close();
  });

  test('no Last-Event-ID means "from now": history is not replayed', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docsse003';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const token = docToken(tenantId, docId, layerName);
    const headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    };

    const old = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [1], rotation: 180 }),
    });
    expect(old.status).toBe(200);

    const sse = new SseCollector();
    await sse.open(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`, token);

    const fresh = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ pageObjectNumbers: [2], rotation: 90 }),
    });
    expect(fresh.status).toBe(200);

    await sse.waitFor(1);
    expect(sse.events).toHaveLength(1); // the old rotate did NOT replay
    expect(sse.events[0].id).toBe(2);
    await sse.close();
  });

  test('revoking the jti closes the stream with auth-revoked (no more watching)', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docsse005';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const token = signDevToken(SECRET, {
      sub: 'user-1',
      tenant_id: tenantId,
      doc_id: docId,
      layer_name: layerName,
      scope: ['*'],
      jti: 'jti-revoke-me',
    });

    const sse = new SseCollector();
    await sse.open(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`, token);

    // Revocation pushed on the bus (any replica) → the open stream closes.
    await fx.bus.publishRevocation('jti-revoke-me', Date.now() + 60_000);

    await sse.waitFor(1);
    expect(sse.events[0].event).toBe('auth-revoked');
    expect(JSON.parse(sse.events[0].data)).toEqual({ reason: 'jti-revoked' });
    await sse.waitForEnd();
    await sse.close();
  });

  test('revoking a DIFFERENT jti leaves the stream open (events keep flowing)', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docsse006';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const token = signDevToken(SECRET, {
      sub: 'user-1',
      tenant_id: tenantId,
      doc_id: docId,
      layer_name: layerName,
      scope: ['*'],
      jti: 'jti-innocent',
    });

    const sse = new SseCollector();
    await sse.open(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`, token);
    await fx.bus.publishRevocation('jti-someone-else', Date.now() + 60_000);

    // The stream must still deliver mutations afterwards.
    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageObjectNumbers: [1], rotation: 90 }),
    });
    expect(res.status).toBe(200);
    await sse.waitFor(1);
    expect(sse.events[0].event).toBe('mutation');
    await sse.close();
  });

  test('the manifest publishes auditHead — the gapless subscribe cursor', async () => {
    const tenantId = 'tenant-sse';
    const docId = 'docsse004';
    const layerName = 'alice';
    await seedDocument(fx, tenantId, docId, { pageCount: 3 });
    const token = docToken(tenantId, docId, layerName);

    const before = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest@docVersion=1`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(before.status).toBe(200);
    expect(((await before.json()) as { auditHead: number }).auditHead).toBe(0);

    const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/pages/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageObjectNumbers: [1], rotation: 90 }),
    });
    expect(res.status).toBe(200);

    const after = await fetch(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/manifest@docVersion=2`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    expect(after.status).toBe(200);
    expect(((await after.json()) as { auditHead: number }).auditHead).toBe(1);
  });
});

describe('drain + readiness — shutdown ends streams instead of hanging on them', () => {
  let fx: Fixture;

  beforeEach(async () => {
    fx = await buildFixture();
  });

  afterEach(async () => {
    await tearDown(fx);
  });

  async function openStream(tenantId: string, docId: string, layerName: string) {
    await seedDocument(fx, tenantId, docId, { pageCount: 1 });
    const sse = new SseCollector();
    await sse.open(
      `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/events`,
      docToken(tenantId, docId, layerName),
    );
    return sse;
  }

  test('beginDrain flips /readyz to 503 and ends live SSE streams', async () => {
    const sse = await openStream('tenant-drain', 'docdrain01', 'alice');

    const before = await fetch(`${fx.baseUrl}/readyz`);
    expect(before.status).toBe(200);

    fx.bundle.beginDrain();

    const after = await fetch(`${fx.baseUrl}/readyz`);
    expect(after.status).toBe(503);
    expect(((await after.json()) as { status: string }).status).toBe('draining');

    // The server ended the hijacked stream deliberately (previously it
    // lived until the client or the supervisor killed the socket).
    await sse.waitForEnd();
  });

  test('shutdown() completes within its budget with a connected SSE viewer', async () => {
    const sse = await openStream('tenant-drain2', 'docdrain02', 'alice');

    // THE regression this feature exists for: with a live SSE socket,
    // app.close() used to wait forever (heartbeats keep it alive) and
    // the supervisor's SIGKILL preempted pool/cache teardown.
    const started = Date.now();
    await fx.bundle.shutdown();
    expect(Date.now() - started).toBeLessThan(10_000);
    await sse.waitForEnd();
  });

  test('a stream connecting mid-drain is ended immediately', async () => {
    await seedDocument(fx, 'tenant-drain3', 'docdrain03', { pageCount: 1 });
    fx.bundle.beginDrain();

    const sse = new SseCollector();
    await sse.open(
      `${fx.baseUrl}/v1/docs/docdrain03/layers/alice/events`,
      docToken('tenant-drain3', 'docdrain03', 'alice'),
    );
    await sse.waitForEnd(); // closed by the register-while-draining path
  });

  test('/readyz reports database unreadiness as 503', async () => {
    await fx.db.destroy();
    const res = await fetch(`${fx.baseUrl}/readyz`);
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; reasons?: string[] };
    expect(body.status).toBe('unready');
    expect(body.reasons).toContain('database');
  });
});

async function buildFixture(): Promise<Fixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'events-sse-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'events-sse-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bus = new InProcessRealtimeBus();
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    corsOrigins: '*',
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    realtimeBus: bus,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return { bundle, app: bundle.app, db, baseUrl, storageRoot, cacheRoot, bus };
}

async function tearDown(fx: Fixture | undefined): Promise<void> {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

function docToken(tenantId: string, docId: string, layerName: string, sub = 'user-1'): string {
  return signDevToken(SECRET, {
    sub,
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
  });
}

async function seedDocument(
  fx: Fixture,
  tenantId: string,
  docId: string,
  opts: { pageCount: number },
): Promise<void> {
  const bytes = new Uint8Array(4096);
  bytes[0] = opts.pageCount;
  bytes.set(randomBytes(4095), 1);
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
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
}
