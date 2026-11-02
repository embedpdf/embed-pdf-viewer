import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
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
import {
  EngineError,
  EngineErrorCode,
  resetDevWarnings,
  type DocumentHandle,
} from '@embedpdf/engine-core/runtime';
import { browserVisitorStore, cloudEngine, type VisitorStore } from '../src/index';

/**
 * A grant's visitor, on the client: every renewal sends the handle the
 * last exchange answered, so the visitor (and on a per-visitor grant, their
 * layer) stays the same; unless the grant gives a new copy every visit, the
 * handle waits in the engine's visitor store for the next open; `restart`
 * starts over; an open document renews on a timer; and the document says how
 * it reaches its layer (`grant`). A grant that asks who the visitor is refuses
 * the open until it carries the answers, or holds the document's changes
 * until `grant.identify` gives them. A passphrase or questions on open that
 * the grant gets while a document is open are asked once (`grant.openRequest`),
 * and the open goes on as the same visitor once `grant.resume` gives them.
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
  const storageRoot = await mkdtemp(join(tmpdir(), 'grant-visitors-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'grant-visitors-cache-'));
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

async function createGrant(body: Record<string, unknown>): Promise<string> {
  // A grant gives only what its maker holds, and these give everything.
  const token = signDevToken(SECRET, {
    sub: 'dash-1',
    tenant_id: TENANT,
    scope: ['*'],
  });
  const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ docId: DOC, scope: ['*'], ...body }),
  });
  expect(res.status).toBe(200);
  return ((await res.json()) as { grant: { id: string } }).grant.id;
}

interface Exchange {
  sent: { visitorHandle?: string; restart?: boolean; visitorIdentity?: Record<string, string> };
  answered: { token: string; layerName: string; visitor: { handle: string; keep: boolean } };
}

/** Node fetch playing the browser (Origin), recording every exchange it carries. */
function browserFetch(exchanges: Exchange[]): typeof fetch {
  return async (input, init) => {
    const headers = new Headers(init?.headers);
    headers.set('origin', ORIGIN);
    const res = await fetch(input, { ...init, headers });
    if (String(input).endsWith('/v1/grant-sessions') && res.ok) {
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
    get: (grant) => handles.get(grant) ?? null,
    set: (grant, handle) => void handles.set(grant, handle),
    delete: (grant) => void handles.delete(grant),
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

const identityOf = (token: string) =>
  (
    JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
      identity: Record<string, string>;
    }
  ).identity;

/** Change a grant's settings, as its owner. */
async function updateGrant(grant: string, body: Record<string, unknown>): Promise<void> {
  const token = signDevToken(SECRET, {
    sub: 'dash-1',
    tenant_id: TENANT,
    scope: ['*'],
  });
  const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants/${grant}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  expect(res.status).toBe(200);
}

describe('a grant visitor', () => {
  test('renewals send the handle, keep the layer, and run on a timer while the document is open', async () => {
    // A 60 second session is always inside the renewal margin: the timer renews every second.
    const grant = await createGrant({ layerMode: 'per-visitor', sessionTtlSeconds: 60 });
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: null,
    });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      expect(doc.grant).toMatchObject({
        layerMode: 'per-visitor',
        keep: true,
        identityRequest: null,
      });
      const first = exchanges[0]!;
      expect(first.sent.visitorHandle).toBeUndefined();

      // Nothing asks for a token after the open: only the timer renews.
      const atOpen = exchanges.length;
      await pause(1_500);
      expect(exchanges.length).toBeGreaterThan(atOpen);
      // Each renewal sends the handle the exchange before it answered: a
      // handle carries when it was issued, so it changes as the visit goes on.
      exchanges.slice(1).forEach((renewal, i) => {
        expect(renewal.sent.visitorHandle).toBe(exchanges[i]!.answered.visitor.handle);
        expect(renewal.answered.layerName).toBe(first.answered.layerName);
      });

      await doc.close();
      const afterClose = exchanges.length;
      await pause(1_500);
      expect(exchanges.length).toBe(afterClose);
    } finally {
      await engine.destroy();
    }
  });

  test('the next open comes back as the same visitor, unless the grant gives a new copy every visit', async () => {
    const shared = await createGrant({});
    const kept = await createGrant({ layerMode: 'per-visitor' });
    const fresh = await createGrant({ layerMode: 'per-visitor', keepVisitorLayers: false });
    const store = memoryStore();
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: store,
    });
    try {
      const open = async (grant: string) => {
        const doc = await engine.open({ kind: 'grant', grant });
        const session = exchanges[exchanges.length - 1]!;
        await doc.close();
        return { doc, session };
      };

      // A shared grant keeps its visitor too: their answers and what they add stay theirs.
      const reader = await open(shared);
      expect(reader.doc.grant).toMatchObject({ layerMode: 'shared', keep: true });
      expect(store.handles.get(shared)).toBe(reader.session.answered.visitor.handle);
      const back = await open(shared);
      expect(back.session.sent.visitorHandle).toBe(reader.session.answered.visitor.handle);
      expect(identityOf(back.session.answered.token).userId).toBe(
        identityOf(reader.session.answered.token).userId,
      );

      const first = await open(kept);
      expect(store.handles.get(kept)).toBe(first.session.answered.visitor.handle);
      const again = await open(kept);
      expect(again.session.sent.visitorHandle).toBe(first.session.answered.visitor.handle);
      expect(again.session.answered.layerName).toBe(first.session.answered.layerName);

      const once = await open(fresh);
      expect(once.doc.grant).toMatchObject({ layerMode: 'per-visitor', keep: false });
      expect(store.handles.has(fresh)).toBe(false);
      const next = await open(fresh);
      expect(next.session.sent.visitorHandle).toBeUndefined();
      expect(next.session.answered.layerName).not.toBe(once.session.answered.layerName);
    } finally {
      await engine.destroy();
    }
  });

  test('restart deletes the kept layer and starts a new visitor', async () => {
    const grant = await createGrant({ layerMode: 'per-visitor' });
    const store = memoryStore();
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: store,
    });
    try {
      await (await engine.open({ kind: 'grant', grant: grant })).close();
      const first = exchanges[0]!.answered;
      await writeAs(first);

      const doc = await engine.open({ kind: 'grant', grant: grant, restart: true });
      const restarted = exchanges[exchanges.length - 1]!;
      expect(restarted.sent).toMatchObject({ visitorHandle: first.visitor.handle, restart: true });
      expect(restarted.answered.layerName).not.toBe(first.layerName);
      expect(store.handles.get(grant)).toBe(restarted.answered.visitor.handle);
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
    const grant = await createGrant({ layerMode: 'per-visitor', sessionTtlSeconds: 60 });
    const store = memoryStore();
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: store,
    });
    let tab: DocumentHandle | undefined;
    try {
      tab = await engine.open({ kind: 'grant', grant: grant });
      await writeAs(exchanges[0]!.answered);
      // Another tab of the same browser starts over.
      const other = await engine.open({ kind: 'grant', grant: grant, restart: true });
      const otherHandle = store.handles.get(grant);

      // The first tab's next renewal finds its layer gone.
      const refused = await tab.pages.list().then(
        () => null,
        (error: unknown) => error,
      );
      expect(refused).toBeInstanceOf(EngineError);
      expect(EngineError.is(refused, EngineErrorCode.Forbidden)).toBe(true);
      expect((refused as EngineError).details).toMatchObject({ reason: 'layer-changed' });
      expect(store.handles.get(grant)).toBe(otherHandle);
      await other.close();
    } finally {
      await tab?.close();
      await engine.destroy();
    }
  });

  test('a document opened with a token says nothing about grants', async () => {
    const token = signDevToken(SECRET, {
      sub: 'user-1',
      tenant_id: TENANT,
      doc_id: DOC,
      scope: ['*'],
    });
    const engine = cloudEngine({ baseUrl: fx.baseUrl });
    try {
      const doc = await engine.open({ kind: 'token', token });
      expect(doc.grant).toBeUndefined();
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

  test('keeps handles in localStorage by grant, and is none without it', () => {
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

describe('a grant that asks who the visitor is', () => {
  /**
   * A change, settled: the stub worker's change answers predate the client's
   * wire schema, so a change that went out settles with a parse error; what
   * matters here is whether it went out (see `changesSent`).
   */
  const square = (doc: DocumentHandle) =>
    doc
      .apply({
        ops: [
          {
            type: 'annotations.create',
            page: { kind: 'objectNumber', objectNumber: 1 },
            data: { subtype: 'square', box: { x: 20, y: 120, width: 40, height: 30 } },
          },
        ],
      })
      .then(
        () => null,
        (error: unknown) => error,
      );
  const identityRequired = (error: unknown) =>
    EngineError.is(error, EngineErrorCode.VisitorIdentityRequired);

  /** The browser's fetch, also recording the status of every change request. */
  function recording(exchanges: Exchange[]): { fetch: typeof fetch; changesSent: number[] } {
    const changesSent: number[] = [];
    const inner = browserFetch(exchanges);
    return {
      changesSent,
      fetch: async (input, init) => {
        const res = await inner(input, init);
        if (String(input).endsWith('/changes')) changesSent.push(res.status);
        return res;
      },
    };
  }

  test('on open: the open is refused until it carries the answers', async () => {
    const grant = await createGrant({
      visitorIdentity: {
        fields: { displayName: 'required', email: 'optional' },
        ask: 'on-open',
        purpose: 'We follow up on every quote.',
      },
    });
    const exchanges: Exchange[] = [];
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch(exchanges),
      visitorStore: null,
    });
    try {
      const refused = await engine.open({ kind: 'grant', grant: grant }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(identityRequired(refused)).toBe(true);
      expect((refused as EngineError).details).toMatchObject({
        fields: { displayName: 'required', email: 'optional' },
        missing: ['displayName'],
        invalid: [],
        purpose: 'We follow up on every quote.',
      });

      // What the page knows about the user answers for them; the server gives the userId.
      resetDevWarnings();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      const doc = await engine.open(
        { kind: 'grant', grant: grant },
        { identity: { userId: 'u_381', displayName: 'Ada' } },
      );
      expect(doc.grant?.identityRequest).toBeNull();
      expect(exchanges[0]!.sent.visitorIdentity).toEqual({ displayName: 'Ada' });
      expect(doc.security.identity).toMatchObject({ displayName: 'Ada' });
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toMatch(
        /doesn't act for the `identity` you passed \(userId\)/,
      );
      warn.mockRestore();
      expect(identityOf(exchanges[0]!.answered.token)).toMatchObject({ displayName: 'Ada' });
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('before the first change: changes wait for the answers, then go out', async () => {
    const grant = await createGrant({
      layerMode: 'per-visitor',
      visitorIdentity: {
        fields: { displayName: 'required', email: 'optional' },
        ask: 'before-first-change',
      },
    });
    const exchanges: Exchange[] = [];
    const { fetch: recordingFetch, changesSent } = recording(exchanges);
    const engine = cloudEngine({ baseUrl: fx.baseUrl, fetch: recordingFetch, visitorStore: null });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      const docGrant = doc.grant!;
      expect(docGrant.identityRequest).toMatchObject({ missing: ['displayName'] });

      // Nobody to ask: a change fails at once, and nothing is sent.
      expect(identityRequired(await square(doc))).toBe(true);
      expect(changesSent).toEqual([]);

      const asked: unknown[] = [];
      docGrant.onIdentityRequest((request) => asked.push(request));
      const waiting = square(doc);
      await pause(50);
      expect(asked).toEqual([expect.objectContaining({ missing: ['displayName'] })]);
      expect(changesSent).toEqual([]);

      // Answers it can't take are refused; the change keeps waiting.
      const typo = await docGrant.identify({ displayName: 'Ada', email: 'ada-at-example' }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(identityRequired(typo)).toBe(true);
      expect((typo as EngineError).details).toMatchObject({ invalid: ['email'] });
      // An answer it takes, with a required one still missing: refused, still waiting.
      const partial = await docGrant.identify({ email: 'ada@example.com' }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(identityRequired(partial)).toBe(true);
      expect((partial as EngineError).details).toMatchObject({ missing: ['displayName'] });
      expect(docGrant.identityRequest).toMatchObject({ missing: ['displayName'] });
      expect(changesSent).toEqual([]);

      await docGrant.identify({ displayName: 'Ada', email: 'ada@example.com' });
      expect(docGrant.identityRequest).toBeNull();
      expect(identityRequired(await waiting)).toBe(false);
      expect(changesSent).toEqual([200]);
      const last = exchanges.at(-1)!;
      expect(last.sent.visitorIdentity).toEqual({ displayName: 'Ada', email: 'ada@example.com' });
      expect(identityOf(last.answered.token)).toMatchObject({ displayName: 'Ada' });
      // The same visitor, on the same layer, all along.
      expect(new Set(exchanges.map((exchange) => exchange.answered.layerName)).size).toBe(1);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('a change the server refuses for the answers waits for them, and goes out again', async () => {
    // A 60 second session is always inside the renewal margin: every request exchanges again.
    const grant = await createGrant({ sessionTtlSeconds: 60 });
    const exchanges: Exchange[] = [];
    const { fetch: recordingFetch, changesSent } = recording(exchanges);
    const engine = cloudEngine({ baseUrl: fx.baseUrl, fetch: recordingFetch, visitorStore: null });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      expect(doc.grant?.identityRequest).toBeNull();
      const asked: unknown[] = [];
      doc.grant!.onIdentityRequest((request) => asked.push(request));
      // The grant starts asking while the document is open: the change's own
      // request renews into a session the server refuses changes from.
      await updateGrant(grant, {
        visitorIdentity: { fields: { displayName: 'required' }, ask: 'before-first-change' },
      });

      const waiting = square(doc);
      await pause(100);
      expect(changesSent).toEqual([403]);
      expect(asked).toEqual([expect.objectContaining({ missing: ['displayName'] })]);
      await doc.grant!.identify({ displayName: 'Late' });
      expect(identityRequired(await waiting)).toBe(false);
      expect(changesSent).toEqual([403, 200]);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('declining fails the changes waiting; the next change asks again', async () => {
    const grant = await createGrant({
      visitorIdentity: { fields: { displayName: 'required' }, ask: 'before-first-change' },
    });
    const { fetch: recordingFetch, changesSent } = recording([]);
    const engine = cloudEngine({ baseUrl: fx.baseUrl, fetch: recordingFetch, visitorStore: null });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      let asked = 0;
      doc.grant!.onIdentityRequest(() => {
        asked += 1;
      });
      const waiting = square(doc);
      await pause(50);
      doc.grant!.decline();
      expect(identityRequired(await waiting)).toBe(true);

      const again = square(doc);
      await pause(50);
      expect(asked).toBe(2);
      expect(changesSent).toEqual([]);
      await doc.grant!.identify({ displayName: 'Later' });
      expect(identityRequired(await again)).toBe(false);
      expect(changesSent).toEqual([200]);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});

describe('a grant that asks again while a document is open', () => {
  /**
   * The browser's fetch, also counting every exchange (refused ones too) and
   * recording the status of every other request. The stub worker's answers
   * predate the client's wire schema, so a read settles with a parse error:
   * what matters is whether it reached the server with a session it took.
   */
  function counting(exchanges: Exchange[]): {
    fetch: typeof fetch;
    tries: { count: number };
    reads: number[];
  } {
    const tries = { count: 0 };
    const reads: number[] = [];
    const inner = browserFetch(exchanges);
    return {
      tries,
      reads,
      fetch: async (input, init) => {
        const exchange = String(input).endsWith('/v1/grant-sessions');
        if (exchange) tries.count += 1;
        const res = await inner(input, init);
        if (!exchange) reads.push(res.status);
        return res;
      },
    };
  }
  /** A read, settled: its error, or null. */
  const read = (doc: DocumentHandle) =>
    doc.pages.list().then(
      () => null,
      (error: unknown) => error,
    );

  afterEach(() => {
    vi.useRealTimers();
  });

  test('questions on open: asked once, the session serves until it runs out, then reads wait for the answers', async () => {
    // A 60 second session is always inside the renewal margin: every request would exchange again.
    const grant = await createGrant({ sessionTtlSeconds: 60 });
    const exchanges: Exchange[] = [];
    const { fetch: countingFetch, tries, reads } = counting(exchanges);
    const engine = cloudEngine({ baseUrl: fx.baseUrl, fetch: countingFetch, visitorStore: null });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      const docGrant = doc.grant!;
      const asked: unknown[] = [];
      docGrant.onOpenRequest((request) => asked.push(request));
      await updateGrant(grant, {
        visitorIdentity: { fields: { displayName: 'required' }, ask: 'on-open' },
      });

      // The next renewal is refused: asked once, and the reads go on with the session they have.
      const before = tries.count;
      reads.length = 0;
      for (let i = 0; i < 5; i += 1) await read(doc);
      await pause(1_500);
      expect(tries.count - before).toBe(1);
      expect(reads).toEqual([200, 200, 200, 200, 200]);
      expect(asked).toEqual([
        { kind: 'identity', request: expect.objectContaining({ missing: ['displayName'] }) },
      ]);
      expect(docGrant.openRequest).toEqual(asked[0]);

      // The session runs out: a read waits for the answers, then goes on as the same visitor.
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 120_000);
      let done = false;
      const reading = read(doc).then(() => {
        done = true;
      });
      await pause(100);
      expect(done).toBe(false);
      expect(tries.count - before).toBe(1);
      expect(reads).toHaveLength(5);

      await docGrant.resume({ identity: { displayName: 'Ada' } });
      await reading;
      expect(reads).toEqual([200, 200, 200, 200, 200, 200]);
      expect(docGrant.openRequest).toBeNull();
      const resumed = exchanges.at(-1)!;
      expect(resumed.sent.visitorHandle).toBe(exchanges.at(-2)!.answered.visitor.handle);
      expect(identityOf(resumed.answered.token)).toMatchObject({
        displayName: 'Ada',
        userId: identityOf(exchanges[0]!.answered.token).userId,
      });
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('a passphrase: a wrong one is refused and still asked; the right one goes on', async () => {
    const grant = await createGrant({ sessionTtlSeconds: 60 });
    const exchanges: Exchange[] = [];
    const { fetch: countingFetch, tries, reads } = counting(exchanges);
    const engine = cloudEngine({ baseUrl: fx.baseUrl, fetch: countingFetch, visitorStore: null });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      const docGrant = doc.grant!;
      const asked: unknown[] = [];
      docGrant.onOpenRequest((request) => asked.push(request));
      await updateGrant(grant, { passphrase: 'open sesame' });

      await read(doc);
      expect(asked).toEqual([{ kind: 'passphrase', passphraseProvided: false }]);
      const refused = await docGrant.resume({ passphrase: 'wrong' }).then(
        () => null,
        (error: unknown) => error,
      );
      expect(EngineError.is(refused, EngineErrorCode.GrantPassphraseRequired)).toBe(true);
      expect(docGrant.openRequest).toEqual({ kind: 'passphrase', passphraseProvided: true });

      await docGrant.resume({ passphrase: 'open sesame' });
      expect(docGrant.openRequest).toBeNull();
      // From then on every renewal carries it, as the same visitor.
      const before = tries.count;
      reads.length = 0;
      await read(doc);
      expect(tries.count).toBeGreaterThan(before);
      expect(reads).toEqual([200]);
      const visitors = new Set(
        exchanges.map((exchange) => identityOf(exchange.answered.token).userId),
      );
      expect(visitors.size).toBe(1);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });

  test('nobody to ask: once the session runs out, a read fails with the refusal', async () => {
    const grant = await createGrant({ sessionTtlSeconds: 60 });
    const engine = cloudEngine({
      baseUrl: fx.baseUrl,
      fetch: browserFetch([]),
      visitorStore: null,
    });
    try {
      const doc = await engine.open({ kind: 'grant', grant: grant });
      await updateGrant(grant, { passphrase: 'open sesame' });
      await read(doc);
      expect(doc.grant!.openRequest).toEqual({ kind: 'passphrase', passphraseProvided: false });

      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(Date.now() + 120_000);
      expect(EngineError.is(await read(doc), EngineErrorCode.GrantPassphraseRequired)).toBe(true);
      await doc.close();
    } finally {
      await engine.destroy();
    }
  });
});
