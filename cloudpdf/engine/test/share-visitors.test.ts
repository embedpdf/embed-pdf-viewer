import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
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
} from '@cloudpdf/server';
import { buildAppForTesting } from '../../server/src/app/buildApp';
import { createValidTestLicenseGate } from '../../server/src/licensing/testing';
import { EngineError, EngineErrorCode, type DocumentHandle } from '@embedpdf/engine-core/runtime';
import { browserVisitorStore, cloudEngine, type VisitorStore } from '../src/index';

/**
 * A share link's visitor, on the client: every renewal sends the handle the
 * last exchange answered, so the visitor (and on a per-visitor link, their
 * layer) stays the same; a link that keeps visitors' layers leaves the
 * handle in the engine's visitor store for the next open; `restart` starts
 * over; an open document renews on a timer; and the document says how it
 * reaches its layer (`share`).
 */

const STUB_ENTRY = fileURLToPath(
  new URL('../../server/test/_helpers/stub-worker-entry.cjs', import.meta.url),
);
const SECRET = 'cloud-engine-visitors-secret';
const TENANT = 'acme';
const DOC = 'doc-visitors';
const ORIGIN = 'https://acme.com';

interface Fixture {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

let fx: Fixture;

beforeEach(async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'share-visitors-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'share-visitors-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  fx = { bundle, db, baseUrl, storageRoot, cacheRoot };
  await seedDocument();
});

afterEach(async () => {
  if (!fx) return;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
});

async function seedDocument(): Promise<void> {
  const bytes = new Uint8Array(4096);
  bytes[0] = 2;
  bytes.set(randomBytes(4094), 2);
  await new FsObjectStore({ root: fx.storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, {
    contentLength: bytes.byteLength,
  });
  await fx.db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: DOC,
      tenant_id: TENANT,
      state: 'ready',
      base_sha: createHash('sha256').update(bytes).digest('hex'),
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

async function createLink(body: Record<string, unknown>): Promise<string> {
  const token = signDevToken(SECRET, {
    sub: 'dash-1',
    tenant_id: TENANT,
    scope: ['shares.manage'],
  });
  const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/shares`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ docId: DOC, scope: ['*'], ...body }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { share: { id: string } }).share.id;
}

interface Exchange {
  sent: { visitorHandle?: string; restart?: boolean };
  answered: { token: string; layerName: string; visitor: { handle: string; keep: boolean } };
}

/** Node fetch playing the browser (Origin), recording every exchange it carries. */
function browserFetch(exchanges: Exchange[]): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('origin', ORIGIN);
    const res = await fetch(input, { ...init, headers });
    if (String(input).endsWith('/v1/share-sessions') && res.ok) {
      exchanges.push({
        sent: JSON.parse(String(init?.body)) as Exchange['sent'],
        answered: (await res.clone().json()) as Exchange['answered'],
      });
    }
    return res;
  };
}

function memoryStore(): VisitorStore & { handles: Map<string, string> } {
  const handles = new Map<string, string>();
  return {
    handles,
    get: (shareToken) => handles.get(shareToken) ?? null,
    set: (shareToken, handle) => void handles.set(shareToken, handle),
    delete: (shareToken) => void handles.delete(shareToken),
  };
}

/** Add an annotation to the layer a session token pins, straight over HTTP. */
async function writeAs(session: Exchange['answered']): Promise<void> {
  const res = await fetch(
    `${fx.baseUrl}/v1/docs/${DOC}/layers/${session.layerName}/annotations/pages/obj:1/items`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.token}`,
        origin: ORIGIN,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        subtype: 'highlight',
        contents: 'mine',
        quadPoints: [
          {
            upperLeft: { x: 0, y: 0 },
            upperRight: { x: 10, y: 0 },
            lowerLeft: { x: 0, y: 10 },
            lowerRight: { x: 10, y: 10 },
          },
        ],
      }),
    },
  );
  expect(res.status).toBe(200);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('a share link visitor', () => {
  test('renewals send the handle, keep the layer, and run on a timer while the document is open', async () => {
    // A 60 second session is always inside the renewal margin: the timer renews every second.
    const link = await createLink({ layerMode: 'per-visitor', sessionTtlSeconds: 60 });
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: null,
    });
    try {
      const doc = await engine.open({ kind: 'share', shareToken: link });
      expect(doc.share).toEqual({ layerMode: 'per-visitor', keep: true });
      const first = exchanges[0]!;
      expect(first.sent.visitorHandle).toBeUndefined();

      // Nothing asks for a token after the open: only the timer renews.
      const atOpen = exchanges.length;
      await pause(1_500);
      expect(exchanges.length).toBeGreaterThan(atOpen);
      for (const renewal of exchanges.slice(1)) {
        expect(renewal.sent.visitorHandle).toBe(first.answered.visitor.handle);
        expect(renewal.answered.layerName).toBe(first.answered.layerName);
      }

      await doc.close();
      const afterClose = exchanges.length;
      await pause(1_500);
      expect(exchanges.length).toBe(afterClose);
    } finally {
      await engine.destroy();
    }
  });

  test('a link that keeps layers brings the visitor back on the next open; one that does not, starts fresh', async () => {
    const kept = await createLink({ layerMode: 'per-visitor' });
    const fresh = await createLink({ layerMode: 'per-visitor', keepVisitorLayers: false });
    const store = memoryStore();
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: store,
    });
    try {
      const open = async (shareToken: string) => {
        const doc = await engine.open({ kind: 'share', shareToken });
        const session = exchanges[exchanges.length - 1]!;
        await doc.close();
        return { doc, session };
      };

      const first = await open(kept);
      expect(store.handles.get(kept)).toBe(first.session.answered.visitor.handle);
      const again = await open(kept);
      expect(again.session.sent.visitorHandle).toBe(first.session.answered.visitor.handle);
      expect(again.session.answered.layerName).toBe(first.session.answered.layerName);

      const once = await open(fresh);
      expect(once.doc.share).toEqual({ layerMode: 'per-visitor', keep: false });
      expect(store.handles.has(fresh)).toBe(false);
      const next = await open(fresh);
      expect(next.session.sent.visitorHandle).toBeUndefined();
      expect(next.session.answered.layerName).not.toBe(once.session.answered.layerName);
    } finally {
      await engine.destroy();
    }
  });

  test('restart deletes the kept layer and starts a new visitor', async () => {
    const link = await createLink({ layerMode: 'per-visitor' });
    const store = memoryStore();
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: store,
    });
    try {
      await (await engine.open({ kind: 'share', shareToken: link })).close();
      const first = exchanges[0]!.answered;
      await writeAs(first);

      const doc = await engine.open({ kind: 'share', shareToken: link, restart: true });
      const restarted = exchanges[exchanges.length - 1]!;
      expect(restarted.sent).toMatchObject({ visitorHandle: first.visitor.handle, restart: true });
      expect(restarted.answered.layerName).not.toBe(first.layerName);
      expect(store.handles.get(link)).toBe(restarted.answered.visitor.handle);
      const old = await fx.db
        .selectFrom('layers')
        .select('deleted_at')
        .where('name', '=', first.layerName)
        .executeTakeFirstOrThrow();
      expect(old.deleted_at).not.toBeNull();
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test("an open whose layer was deleted under it refuses, and leaves the other tab's visitor stored", async () => {
    const link = await createLink({ layerMode: 'per-visitor', sessionTtlSeconds: 60 });
    const store = memoryStore();
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: store,
    });
    let tab: DocumentHandle | undefined;
    try {
      tab = await engine.open({ kind: 'share', shareToken: link });
      await writeAs(exchanges[0]!.answered);
      // Another tab of the same browser starts over.
      const other = await engine.open({ kind: 'share', shareToken: link, restart: true });
      const otherHandle = store.handles.get(link);

      // The first tab's next renewal finds its layer gone.
      const refused = await tab.pages.list().then(
        () => null,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(EngineError);
      expect(EngineError.is(refused, EngineErrorCode.Forbidden)).toBe(true);
      expect((refused as EngineError).details).toMatchObject({ reason: 'layer-changed' });
      expect(store.handles.get(link)).toBe(otherHandle);
      await other.close();
    } finally {
      await tab?.close();
      await engine.destroy();
    }
  });

  test('a document opened with a token says nothing about share links', async () => {
    const token = signDevToken(SECRET, {
      sub: 'user-1',
      tenant_id: TENANT,
      doc_id: DOC,
      scope: ['*'],
    });
    const engine = cloudEngine({ baseUrl: fx.baseUrl });
    try {
      const doc = await engine.open({ kind: 'token', token });
      expect(doc.share).toBeUndefined();
    } finally {
      await engine.destroy();
    }
  });
});

describe('browserVisitorStore', () => {
  const global = globalThis as { localStorage?: unknown };
  const saved = global.localStorage;
  afterEach(() => {
    if (saved === undefined) delete global.localStorage;
    else global.localStorage = saved;
  });

  test('keeps handles in localStorage by share token, and is none without it', () => {
    delete global.localStorage;
    expect(browserVisitorStore()).toBeNull();

    const items = new Map<string, string>();
    global.localStorage = {
      getItem: (key: string) => items.get(key) ?? null,
      setItem: (key: string, value: string) => void items.set(key, value),
      removeItem: (key: string) => void items.delete(key),
    };
    const store = browserVisitorStore()!;
    void store.set('shr_abc', 'vis_1');
    expect(items.get('cloudpdf.visitor.shr_abc')).toBe('vis_1');
    expect(store.get('shr_abc')).toBe('vis_1');
    void store.delete('shr_abc');
    expect(store.get('shr_abc')).toBeNull();
  });

  test('a browser that refuses storage keeps nothing and never throws', () => {
    const refuse = () => {
      throw new Error('SecurityError');
    };
    global.localStorage = { getItem: refuse, setItem: refuse, removeItem: refuse };
    const store = browserVisitorStore()!;
    expect(() => store.set('shr_abc', 'vis_1')).not.toThrow();
    expect(store.get('shr_abc')).toBeNull();
    expect(() => store.delete('shr_abc')).not.toThrow();
  });
});
