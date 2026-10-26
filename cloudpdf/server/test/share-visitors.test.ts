/**
 * Whose layer a share link's visitors write into. A link is `shared` (one
 * layer everyone reads and writes) or `per-visitor` (a layer of each
 * visitor's own, `visitor-<id>`, made at their first write and stamped with
 * the link and visitor). Every exchange names a visitor, whose handle brings
 * them back: renewals keep the visitor, and on a per-visitor link their
 * layer; each restarts the visitor's idle clock. Starting over gives a new
 * visitor (and deletes the old one's layer); a deleted layer, or a handle the
 * link didn't issue, gets a new visitor. Visitors stay until deleted on
 * purpose, unless their link sets an idle time (throwaway layers, like
 * examples): then the sweep deletes the ones unseen for longer, with their
 * layers. A visit is one view however often it renews. Ending a link
 * archives it, for good and keeping what its visitors made; a link is
 * deleted only once it has no visitors.
 */
import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  sqliteMigrations,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { VisitorHandles } from '../src/auth/visitor-handle';
import { createValidTestLicenseGate } from '../src/licensing/testing';
import { sweepIdleVisitors } from '../src/services/shareVisitors';
import { highlightDraft } from './_helpers/two-replica-harness';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'share-visitors-secret';
const API_TOKEN = 'share-visitors-root-token';
const TENANT = 'tenant-visitors';
const DOC = 'doc-visitors';
const ORIGIN = 'https://acme.example';
const HOUR_MS = 60 * 60 * 1000;
const YEAR_MS = 365 * 24 * HOUR_MS;

let dir: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'share-visitors-'));
  const storageRoot = join(dir, 'objects');
  db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    apiAuthTokens: [API_TOKEN],
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: join(dir, 'cache'),
    cacheMaxBytes: 1024 * 1024,
    corsOrigins: '*',
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;

  const bytes = new Uint8Array(4096);
  bytes[0] = 2; // stub page count
  bytes.set(randomBytes(4094), 2);
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, {
    contentLength: bytes.byteLength,
  });
  await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await db
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
}, 60_000);

afterAll(async () => {
  await bundle?.shutdown();
  await db?.destroy();
  await rm(dir, { recursive: true, force: true });
});

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test responses are probed loosely
  body: any;
}

async function call(
  method: string,
  url: string,
  opts: { token?: string; body?: unknown; origin?: string } = {},
): Promise<Answer> {
  const res = await fetch(`${baseUrl}${url}`, {
    method,
    headers: {
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.origin ? { origin: opts.origin } : {}),
      ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

const createLink = (body: Record<string, unknown>) =>
  call('POST', `/v1/tenants/${TENANT}/shares`, {
    token: API_TOKEN,
    body: { docId: DOC, scope: ['*'], ...body },
  });

const updateLink = (id: string, body: Record<string, unknown>) =>
  call('PATCH', `/v1/tenants/${TENANT}/shares/${id}`, { token: API_TOKEN, body });

const archiveLink = (id: string) =>
  call('POST', `/v1/tenants/${TENANT}/shares/${id}/archive`, { token: API_TOKEN });

const exchange = (body: Record<string, unknown>) =>
  call('POST', '/v1/share-sessions', { body, origin: ORIGIN });

/** A link's session, as its visitor: `token`, `layerName`, `visitor`. */
async function visit(shareToken: string, extra: Record<string, unknown> = {}) {
  const answer = await exchange({ shareToken, ...extra });
  expect(answer.status).toBe(200);
  return answer.body as {
    token: string;
    layerName: string;
    layerMode: string;
    visitor: { handle: string; keep: boolean };
  };
}

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
    sub: string;
    layer_name: string;
    identity?: { userId?: string };
  };

const annotate = (session: { token: string; layerName: string }, contents: string) =>
  call('POST', `/v1/docs/${DOC}/layers/${session.layerName}/annotations/pages/obj:1/items`, {
    token: session.token,
    body: highlightDraft(contents),
    origin: ORIGIN,
  });

const listed = async (session: { token: string; layerName: string }) => {
  const answer = await call(
    'GET',
    `/v1/docs/${DOC}/layers/${session.layerName}/annotations/pages/obj:1/items`,
    { token: session.token, origin: ORIGIN },
  );
  expect(answer.status).toBe(200);
  return (answer.body.annotations as Array<{ contents: string | null }>).map((a) => a.contents);
};

const layerRow = (name: string) =>
  db
    .selectFrom('layers')
    .selectAll()
    .where('doc_id', '=', DOC)
    .where('name', '=', name)
    .executeTakeFirst();

const visitorIdOf = (session: { token: string }) =>
  claimsOf(session.token).identity!.userId!.slice('visitor_'.length);

const visitorRow = (session: { token: string }) =>
  db
    .selectFrom('share_visitors')
    .selectAll()
    .where('visitor_id', '=', visitorIdOf(session))
    .executeTakeFirst();

/** Set when the session's visitor was last seen. */
const lastSeen = (session: { token: string }, at: number) =>
  db
    .updateTable('share_visitors')
    .set({ last_seen_at: at })
    .where('visitor_id', '=', visitorIdOf(session))
    .execute();

describe("a link's layer policy", () => {
  test('a per-visitor link names no layer and carries its settings; a shared link keeps its layer', async () => {
    const shared = await createLink({});
    expect(shared.status).toBe(200);
    expect(shared.body.share).toMatchObject({
      layerMode: 'shared',
      layerName: 'default',
      keepVisitorLayers: true,
      visitorIdleSeconds: null,
    });
    // Visitors' layers stay unless the link asks for them to go.
    const kept = await createLink({ layerMode: 'per-visitor' });
    expect(kept.body.share).toMatchObject({
      layerMode: 'per-visitor',
      visitorIdleSeconds: null,
    });

    const perVisitor = await createLink({
      layerMode: 'per-visitor',
      keepVisitorLayers: false,
      visitorIdleSeconds: 3600,
    });
    expect(perVisitor.status).toBe(200);
    expect(perVisitor.body.share).toMatchObject({
      layerMode: 'per-visitor',
      layerName: null,
      keepVisitorLayers: false,
      visitorIdleSeconds: 3600,
    });
  });

  test('refuses a layer on a per-visitor link, a visitor-… name, and an idle time out of range', async () => {
    const named = await createLink({ layerMode: 'per-visitor', layerName: 'review' });
    expect(named.status).toBe(400);
    expect(named.body.error.message).toMatch(/per-visitor link names no layer/);
    const reserved = await createLink({ layerName: 'visitor-0123' });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error.message).toMatch(/visitor-/);
    expect((await createLink({ layerMode: 'per-visitor', visitorIdleSeconds: 60 })).status).toBe(
      400,
    );
    const issued = await call('POST', `/v1/tenants/${TENANT}/tokens`, {
      token: API_TOKEN,
      body: {
        kind: 'doc',
        sub: 'user-1',
        docId: DOC,
        layerName: 'visitor-0123',
        scope: ['*'],
        expiresIn: 600,
      },
    });
    expect(issued.status).toBe(400);
    expect(issued.body.error.message).toMatch(/visitors' own layers/);
  });

  test('switches between shared and per-visitor and keeps its token', async () => {
    const link = (await createLink({ layerName: 'review' })).body.share;
    const toVisitors = await updateLink(link.id, { layerMode: 'per-visitor' });
    expect(toVisitors.status).toBe(200);
    expect(toVisitors.body.share).toMatchObject({
      id: link.id,
      layerMode: 'per-visitor',
      layerName: null,
    });
    expect((await updateLink(link.id, { layerName: 'review' })).status).toBe(400);

    const back = await updateLink(link.id, { layerMode: 'shared', layerName: 'review-2' });
    expect(back.body.share).toMatchObject({ layerMode: 'shared', layerName: 'review-2' });
    const settings = await updateLink(link.id, {
      keepVisitorLayers: false,
      visitorIdleSeconds: 7200,
    });
    expect(settings.body.share).toMatchObject({
      keepVisitorLayers: false,
      visitorIdleSeconds: 7200,
    });
    const keepAgain = await updateLink(link.id, { visitorIdleSeconds: null });
    expect(keepAgain.body.share.visitorIdleSeconds).toBeNull();
  });
});

describe('the exchange names a visitor', () => {
  test('the token makes them the author, and a renewal with their handle keeps them', async () => {
    const link = (await createLink({ layerName: 'together' })).body.share;
    const first = await visit(link.id);
    expect(first).toMatchObject({ layerName: 'together', layerMode: 'shared' });
    expect(first.visitor.handle).toMatch(/^vis_[0-9a-f]{24}\.[0-9a-z]+\.[A-Za-z0-9_-]{22}$/);
    expect(first.visitor.keep).toBe(false);
    const claims = claimsOf(first.token);
    expect(claims).toMatchObject({ sub: `share:${link.id}`, layer_name: 'together' });
    expect(claims.identity?.userId).toMatch(/^visitor_[0-9a-f]{24}$/);

    const renewed = await visit(link.id, { visitorHandle: first.visitor.handle });
    expect(claimsOf(renewed.token).identity).toEqual(claims.identity);
    // Starting over is someone new, on any link.
    const restarted = await visit(link.id, { visitorHandle: first.visitor.handle, restart: true });
    expect(claimsOf(restarted.token).identity?.userId).not.toBe(claims.identity?.userId);
    expect(restarted.visitor.handle).not.toBe(first.visitor.handle);
  });

  test('a handle another link issued, a forged one, or garbage is a new visitor', async () => {
    const link = (await createLink({})).body.share;
    const other = (await createLink({})).body.share;
    const theirs = await visit(other.id);
    const [, issued, mac] = theirs.visitor.handle.split('.');
    const forged = `vis_${'0'.repeat(24)}.${issued}.${mac}`;
    for (const visitorHandle of [theirs.visitor.handle, forged, 'not-a-handle']) {
      const answer = await visit(link.id, { visitorHandle });
      expect(answer.visitor.handle).not.toBe(visitorHandle);
      expect(claimsOf(answer.token).identity).not.toEqual(claimsOf(theirs.token).identity);
    }
  });
});

describe('a per-visitor link', () => {
  test('gives each visitor a layer of their own, made and stamped at their first write', async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const alice = await visit(link.id);
    const bob = await visit(link.id);
    expect(alice.layerMode).toBe('per-visitor');
    expect(alice.visitor.keep).toBe(true);
    expect(alice.layerName).toMatch(/^visitor-[0-9a-f]{24}$/);
    expect(bob.layerName).not.toBe(alice.layerName);
    expect(claimsOf(alice.token).layer_name).toBe(alice.layerName);
    expect(await layerRow(alice.layerName)).toBeUndefined();
    expect(await visitorRow(alice)).toBeUndefined();

    expect((await annotate(alice, 'from alice')).status).toBe(200);
    const visitorId = alice.layerName.slice('visitor-'.length);
    expect(await layerRow(alice.layerName)).toMatchObject({
      grant_id: link.id,
      visitor_id: visitorId,
    });
    // Their first write makes them a visitor the link keeps (asked nothing).
    expect(await visitorRow(alice)).toMatchObject({
      grant_id: link.id,
      visitor_id: visitorId,
      doc_id: DOC,
      consented_at: null,
      last_seen_at: expect.any(Number),
    });
    expect(await listed(alice)).toEqual(['from alice']);
    expect(await listed(bob)).toEqual([]);
    // Alice's session can't reach Bob's layer.
    const crossing = await annotate({ token: alice.token, layerName: bob.layerName }, 'into bob');
    expect(crossing.status).toBe(403);
  });

  test("a renewal keeps the visitor's layer and restarts their idle clock", async () => {
    const link = (await createLink({ layerMode: 'per-visitor', keepVisitorLayers: false })).body
      .share;
    const first = await visit(link.id);
    expect(first.visitor.keep).toBe(false);
    expect((await annotate(first, 'kept')).status).toBe(200);
    await lastSeen(first, 1);

    const renewed = await visit(link.id, { visitorHandle: first.visitor.handle });
    expect(renewed.layerName).toBe(first.layerName);
    expect((await visitorRow(first))?.last_seen_at).toBeGreaterThan(Date.now() - 60_000);
    expect(await listed(renewed)).toEqual(['kept']);
  });

  test('starting over deletes the layer and gives a new visitor', async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const first = await visit(link.id);
    expect((await annotate(first, 'half-filled')).status).toBe(200);

    const fresh = await visit(link.id, { visitorHandle: first.visitor.handle, restart: true });
    expect(fresh.layerName).not.toBe(first.layerName);
    expect(await listed(fresh)).toEqual([]);
    expect((await layerRow(first.layerName))?.deleted_at).not.toBeNull();
    expect(await visitorRow(first)).toBeUndefined();
    const old = await annotate(first, 'too late');
    expect(old.status).toBe(410);
    expect(old.body.error.code).toBe('LayerDeleted');
  });

  test('a visitor whose layer was deleted comes back as a new visitor', async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const first = await visit(link.id);
    expect((await annotate(first, 'gone')).status).toBe(200);
    const deleted = await call(
      'DELETE',
      `/v1/tenants/${TENANT}/documents/${DOC}/layers/${first.layerName}`,
      { token: API_TOKEN },
    );
    expect(deleted.status).toBe(204);

    const back = await visit(link.id, { visitorHandle: first.visitor.handle });
    expect(back.layerName).not.toBe(first.layerName);
    expect((await annotate(back, 'again')).status).toBe(200);
  });

  test("a visitor who never wrote keeps their (unmade) layer's name", async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const first = await visit(link.id);
    const renewed = await visit(link.id, { visitorHandle: first.visitor.handle });
    expect(renewed.layerName).toBe(first.layerName);
    expect(await layerRow(first.layerName)).toBeUndefined();
  });
});

describe('the idle sweep', () => {
  const sweep = (now: number) =>
    sweepIdleVisitors(
      { db, deleteLayer: (tenantId, input) => bundle.layerService!.deleteLayer(tenantId, input) },
      now,
    );

  test("deletes visitors unseen past their link's idle time, with their layers, and only those", async () => {
    const hourly = (await createLink({ layerMode: 'per-visitor', visitorIdleSeconds: 3600 })).body
      .share;
    const keeping = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const shared = (await createLink({ layerName: 'swept-never' })).body.share;
    const gone = await visit(hourly.id);
    const recent = await visit(hourly.id);
    const filledIn = await visit(keeping.id);
    const together = await visit(shared.id);
    for (const session of [gone, recent, filledIn, together]) {
      expect((await annotate(session, 'mine')).status).toBe(200);
    }
    const now = Date.now();
    await lastSeen(gone, now - 2 * HOUR_MS);
    await lastSeen(recent, now - HOUR_MS / 2);
    // A link that sets no idle time keeps what its visitors filled in, however long ago.
    await lastSeen(filledIn, now - YEAR_MS);

    expect(await sweep(now)).toBe(1);
    expect((await layerRow(gone.layerName))?.deleted_at).not.toBeNull();
    expect(await visitorRow(gone)).toBeUndefined();
    expect(await visitorRow(recent)).toBeDefined();
    for (const kept of [recent, filledIn, together]) {
      expect((await layerRow(kept.layerName))?.deleted_at).toBeNull();
    }
    // The swept visitor comes back as someone new.
    const back = await visit(hourly.id, { visitorHandle: gone.visitor.handle });
    expect(back.layerName).not.toBe(gone.layerName);
    expect(await sweep(now)).toBe(0);
  });

  test("an archived link's visitors' layers keep to the link's own setting", async () => {
    const keeping = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const hourly = (await createLink({ layerMode: 'per-visitor', visitorIdleSeconds: 3600 })).body
      .share;
    const filledIn = await visit(keeping.id);
    const throwaway = await visit(hourly.id);
    expect((await annotate(filledIn, 'filled in')).status).toBe(200);
    expect((await annotate(throwaway, 'example')).status).toBe(200);
    for (const link of [keeping, hourly]) {
      expect((await archiveLink(link.id)).status).toBe(200);
    }
    const now = Date.now();
    await lastSeen(filledIn, now - YEAR_MS);
    await lastSeen(throwaway, now - 2 * HOUR_MS);

    await sweep(now);
    expect((await layerRow(filledIn.layerName))?.deleted_at).toBeNull();
    expect((await layerRow(throwaway.layerName))?.deleted_at).not.toBeNull();
  });
});

describe('ending a link', () => {
  const listLinks = (query = '') =>
    call('GET', `/v1/tenants/${TENANT}/shares?docId=${DOC}${query}`, { token: API_TOKEN });
  const deleteLink = (id: string) =>
    call('DELETE', `/v1/tenants/${TENANT}/shares/${id}`, { token: API_TOKEN });
  const ids = (answer: Answer) => answer.body.shares.map((share: { id: string }) => share.id);

  test('archiving stops it for good and keeps it, listed apart', async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const visitor = await visit(link.id);
    expect((await annotate(visitor, 'kept')).status).toBe(200);

    const archived = await archiveLink(link.id);
    expect(archived.status).toBe(200);
    expect(archived.body.share.archivedAt).toEqual(expect.any(Number));
    // Final: no exchange, with or without a handle, and no more changes.
    expect((await exchange({ shareToken: link.id })).status).toBe(404);
    expect(
      (await exchange({ shareToken: link.id, visitorHandle: visitor.visitor.handle })).status,
    ).toBe(404);
    const changed = await updateLink(link.id, { disabled: false });
    expect(changed.status).toBe(409);
    expect(changed.body.error.message).toMatch(/archived/);
    // Archiving again changes nothing.
    const again = await archiveLink(link.id);
    expect(again.body.share.archivedAt).toBe(archived.body.share.archivedAt);

    expect(ids(await listLinks())).not.toContain(link.id);
    expect(ids(await listLinks('&archived=false'))).not.toContain(link.id);
    expect(ids(await listLinks('&archived=true'))).toContain(link.id);
    expect((await listLinks('&archived=yes')).status).toBe(400);
    // What its visitor made is still there.
    expect((await layerRow(visitor.layerName))?.deleted_at).toBeNull();
  });

  test("deleting is refused while it has visitors, and works once they're deleted", async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const [alice, bob] = [await visit(link.id), await visit(link.id)];
    expect((await annotate(alice, 'alice')).status).toBe(200);
    expect((await annotate(bob, 'bob')).status).toBe(200);

    const refused = await deleteLink(link.id);
    expect(refused.status).toBe(409);
    expect(refused.body.error).toMatchObject({
      code: 'Conflict',
      details: { visitors: 2, visitorLayers: 2 },
    });
    expect(refused.body.error.message).toMatch(/archive it instead/);

    // Deleting a visitor's layer leaves the visitor.
    const removed = await call(
      'DELETE',
      `/v1/tenants/${TENANT}/documents/${DOC}/layers/${alice.layerName}`,
      { token: API_TOKEN },
    );
    expect(removed.status).toBe(204);
    expect((await deleteLink(link.id)).body.error.details).toEqual({
      visitors: 2,
      visitorLayers: 1,
    });

    for (const session of [alice, bob]) {
      const gone = await call(
        'DELETE',
        `/v1/tenants/${TENANT}/shares/${link.id}/visitors/${visitorIdOf(session)}`,
        { token: API_TOKEN },
      );
      expect(gone.status).toBe(204);
    }
    expect((await layerRow(bob.layerName))?.deleted_at).not.toBeNull();
    expect((await deleteLink(link.id)).status).toBe(204);
  });

  test('a link whose visitors only looked can be deleted', async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    await visit(link.id);
    expect((await deleteLink(link.id)).status).toBe(204);
  });

  test('an archived shared link no longer keeps its layer from being deleted', async () => {
    const link = (await createLink({ layerName: 'ended-review' })).body.share;
    expect((await annotate(await visit(link.id), 'comment')).status).toBe(200);
    const deleteLayer = () =>
      call('DELETE', `/v1/tenants/${TENANT}/documents/${DOC}/layers/ended-review`, {
        token: API_TOKEN,
      });
    expect((await deleteLayer()).status).toBe(409);
    expect((await archiveLink(link.id)).status).toBe(200);
    expect((await deleteLayer()).status).toBe(204);
  });
});

describe('views', () => {
  const views = async () => {
    const usage = await call('GET', `/v1/tenants/${TENANT}/usage`, { token: API_TOKEN });
    expect(usage.status).toBe(200);
    return usage.body.metrics['pdf.views'] as number;
  };

  test('a visit is one view however often it renews; a new or returning visit is another', async () => {
    const link = (await createLink({ layerMode: 'per-visitor' })).body.share;
    const other = (await createLink({})).body.share;
    const start = await views();

    const first = await visit(link.id);
    expect(await views()).toBe(start + 1);
    const renewed = await visit(link.id, { visitorHandle: first.visitor.handle });
    const again = await visit(link.id, { visitorHandle: renewed.visitor.handle });
    expect(again.layerName).toBe(first.layerName);
    expect(await views()).toBe(start + 1);

    // Someone else, the other link's visitor, that visitor's handle here
    // (another link issued it), and the first visitor coming back after
    // their session lapsed: four more visits.
    await visit(link.id);
    await visit(link.id, { visitorHandle: (await visit(other.id)).visitor.handle });
    const lapsed = new VisitorHandles(SECRET).issue(
      link.id,
      first.layerName.slice('visitor-'.length),
      Date.now() - HOUR_MS,
    );
    const returning = await visit(link.id, { visitorHandle: lapsed });
    expect(returning.layerName).toBe(first.layerName);
    expect(await views()).toBe(start + 5);
  });
});

describe('migration 039', () => {
  test("links on the old 7-day default keep their visitors' layers; a chosen idle time stays", async () => {
    const fresh = createSqliteDb({ path: ':memory:' });
    try {
      const upTo038 = sqliteMigrations.filter((m) => m.version < '039');
      expect(upTo038.at(-1)?.version).toBe('038');
      await migrate(fresh, { source: { kind: 'inline', migrations: upTo038 } });
      await fresh.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
      await fresh
        .insertInto('documents')
        .values({
          id: DOC,
          tenant_id: TENANT,
          state: 'ready',
          base_sha: null,
          storage_size_bytes: 1,
          metadata_json: null,
          idempotency_key: null,
          failure_reason: null,
          created_at: 1,
          updated_at: 1,
          created_by: null,
        })
        .execute();
      const link = (id: string, idle: number) => ({
        id,
        tenant_id: TENANT,
        doc_id: DOC,
        layer_mode: 'per-visitor' as const,
        layer_name: null,
        keep_visitor_layers: 1,
        visitor_layer_idle_seconds: idle,
        scope_json: '["*"]',
        origins_json: null,
        password_hash: null,
        session_ttl_seconds: 600,
        disabled: 0,
        expires_at: null,
        exchange_count: 0,
        last_exchanged_at: null,
        created_by: 'test',
        created_at: 1,
        updated_at: 1,
      });
      await fresh
        .insertInto('share_grants')
        .values([link('shr_defaulted', 604800), link('shr_hourly', 3600)])
        .execute();

      const upTo039 = sqliteMigrations.filter((m) => m.version <= '039');
      await migrate(fresh, { source: { kind: 'inline', migrations: upTo039 } });
      const rows = await fresh
        .selectFrom('share_grants')
        .select(['id', 'visitor_layer_idle_seconds'])
        .orderBy('id')
        .execute();
      expect(rows).toEqual([
        { id: 'shr_defaulted', visitor_layer_idle_seconds: null },
        { id: 'shr_hourly', visitor_layer_idle_seconds: 3600 },
      ]);
    } finally {
      await fresh.destroy();
    }
  });
});

describe('migration 042', () => {
  test("visitors' layers become visitors, with their idle clock; the link's idle time stays", async () => {
    const fresh = createSqliteDb({ path: ':memory:' });
    try {
      const upTo041 = sqliteMigrations.filter((m) => m.version < '042');
      expect(upTo041.at(-1)?.version).toBe('041');
      await migrate(fresh, { source: { kind: 'inline', migrations: upTo041 } });
      await fresh.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
      await fresh
        .insertInto('documents')
        .values({
          id: DOC,
          tenant_id: TENANT,
          state: 'ready',
          base_sha: null,
          storage_size_bytes: 1,
          metadata_json: null,
          idempotency_key: null,
          failure_reason: null,
          created_at: 1,
          updated_at: 1,
          created_by: null,
        })
        .execute();
      await fresh
        .insertInto('share_grants')
        .values({
          id: 'shr_hourly',
          tenant_id: TENANT,
          doc_id: DOC,
          layer_mode: 'per-visitor',
          layer_name: null,
          keep_visitor_layers: 1,
          visitor_layer_idle_seconds: 3600,
          scope_json: '["*"]',
          origins_json: null,
          password_hash: null,
          session_ttl_seconds: 600,
          disabled: 0,
          archived_at: null,
          expires_at: null,
          exchange_count: 0,
          last_exchanged_at: null,
          created_by: 'test',
          created_at: 1,
          updated_at: 1,
        } as never)
        .execute();
      const layer = (name: string, visitorId: string, extra: Record<string, unknown>) => ({
        id: `layer-${name}`,
        doc_id: DOC,
        tenant_id: TENANT,
        name,
        base_sha: null,
        current_version: 1,
        current_artifact_key: null,
        current_artifact_sha: null,
        current_artifact_size: null,
        created_at: 100,
        updated_at: 100,
        grant_id: 'shr_hourly',
        visitor_id: visitorId,
        deleted_at: null,
        ...extra,
      });
      await fresh
        .insertInto('layers')
        .values([
          layer('visitor-aaa', 'aaa', { last_seen_at: 500 }),
          layer('visitor-bbb', 'bbb', { last_seen_at: null }),
          layer('visitor-ccc', 'ccc', { last_seen_at: 700, deleted_at: 800 }),
        ] as never)
        .execute();

      await migrate(fresh, { source: { kind: 'inline', migrations: sqliteMigrations } });
      const visitors = await fresh
        .selectFrom('share_visitors')
        .select(['visitor_id', 'first_seen_at', 'last_seen_at', 'consented_at'])
        .orderBy('visitor_id')
        .execute();
      // A deleted layer's visitor is gone already.
      expect(visitors).toEqual([
        { visitor_id: 'aaa', first_seen_at: 100, last_seen_at: 500, consented_at: null },
        { visitor_id: 'bbb', first_seen_at: 100, last_seen_at: 100, consented_at: null },
      ]);
      const grant = await fresh
        .selectFrom('share_grants')
        .select(['visitor_idle_seconds', 'visitor_identity_json'])
        .executeTakeFirstOrThrow();
      expect(grant).toEqual({ visitor_idle_seconds: 3600, visitor_identity_json: null });
    } finally {
      await fresh.destroy();
    }
  });
});
