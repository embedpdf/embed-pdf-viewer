/**
 * Whose layer a share link's visitors write into. A link is `shared` (one
 * layer everyone reads and writes) or `per-visitor` (a layer of each
 * visitor's own, `visitor-<id>`, made at their first write and stamped with
 * the link and visitor). Every exchange names a visitor, whose handle brings
 * them back: renewals keep the visitor, and on a per-visitor link their
 * layer, whose idle clock restarts. Starting over deletes the layer; a
 * deleted layer, or a handle the link didn't issue, gets a new visitor.
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
import { createValidTestLicenseGate } from '../src/licensing/testing';
import { highlightDraft } from './_helpers/two-replica-harness';

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'share-visitors-secret';
const API_TOKEN = 'share-visitors-root-token';
const TENANT = 'tenant-visitors';
const DOC = 'doc-visitors';
const ORIGIN = 'https://acme.example';
const WEEK = 7 * 24 * 60 * 60;

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

describe("a link's layer policy", () => {
  test('a per-visitor link names no layer and carries its settings; a shared link keeps its layer', async () => {
    const shared = await createLink({});
    expect(shared.status).toBe(200);
    expect(shared.body.share).toMatchObject({
      layerMode: 'shared',
      layerName: 'default',
      keepVisitorLayers: true,
      visitorLayerIdleSeconds: WEEK,
    });

    const perVisitor = await createLink({
      layerMode: 'per-visitor',
      keepVisitorLayers: false,
      visitorLayerIdleSeconds: 3600,
    });
    expect(perVisitor.status).toBe(200);
    expect(perVisitor.body.share).toMatchObject({
      layerMode: 'per-visitor',
      layerName: null,
      keepVisitorLayers: false,
      visitorLayerIdleSeconds: 3600,
    });
  });

  test('refuses a layer on a per-visitor link, a visitor-… name, and an idle time out of range', async () => {
    const named = await createLink({ layerMode: 'per-visitor', layerName: 'review' });
    expect(named.status).toBe(400);
    expect(named.body.error.message).toMatch(/per-visitor link names no layer/);
    const reserved = await createLink({ layerName: 'visitor-0123' });
    expect(reserved.status).toBe(400);
    expect(reserved.body.error.message).toMatch(/visitor-/);
    expect(
      (await createLink({ layerMode: 'per-visitor', visitorLayerIdleSeconds: 60 })).status,
    ).toBe(400);
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
      visitorLayerIdleSeconds: 7200,
    });
    expect(settings.body.share).toMatchObject({
      keepVisitorLayers: false,
      visitorLayerIdleSeconds: 7200,
    });
  });
});

describe('the exchange names a visitor', () => {
  test('the token makes them the author, and a renewal with their handle keeps them', async () => {
    const link = (await createLink({ layerName: 'together' })).body.share;
    const first = await visit(link.id);
    expect(first).toMatchObject({ layerName: 'together', layerMode: 'shared' });
    expect(first.visitor.handle).toMatch(/^vis_[0-9a-f]{24}\.[A-Za-z0-9_-]{22}$/);
    expect(first.visitor.keep).toBe(false);
    const claims = claimsOf(first.token);
    expect(claims).toMatchObject({ sub: `share:${link.id}`, layer_name: 'together' });
    expect(claims.identity?.userId).toMatch(/^visitor_[0-9a-f]{24}$/);

    const renewed = await visit(link.id, { visitorHandle: first.visitor.handle });
    expect(claimsOf(renewed.token).identity).toEqual(claims.identity);
    // Starting over means nothing on a shared link.
    const restarted = await visit(link.id, { visitorHandle: first.visitor.handle, restart: true });
    expect(claimsOf(restarted.token).identity).toEqual(claims.identity);
  });

  test('a handle another link issued, a forged one, or garbage is a new visitor', async () => {
    const link = (await createLink({})).body.share;
    const other = (await createLink({})).body.share;
    const theirs = await visit(other.id);
    const [, mac] = theirs.visitor.handle.split('.');
    const forged = `vis_${'0'.repeat(24)}.${mac}`;
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

    expect((await annotate(alice, 'from alice')).status).toBe(200);
    const row = await layerRow(alice.layerName);
    expect(row).toMatchObject({
      grant_id: link.id,
      visitor_id: alice.layerName.slice('visitor-'.length),
      last_seen_at: expect.any(Number),
    });
    expect(await listed(alice)).toEqual(['from alice']);
    expect(await listed(bob)).toEqual([]);
    // Alice's session can't reach Bob's layer.
    const crossing = await annotate({ token: alice.token, layerName: bob.layerName }, 'into bob');
    expect(crossing.status).toBe(403);
  });

  test("a renewal keeps the visitor's layer and restarts its idle clock", async () => {
    const link = (await createLink({ layerMode: 'per-visitor', keepVisitorLayers: false })).body
      .share;
    const first = await visit(link.id);
    expect(first.visitor.keep).toBe(false);
    expect((await annotate(first, 'kept')).status).toBe(200);
    await db
      .updateTable('layers')
      .set({ last_seen_at: 1 })
      .where('name', '=', first.layerName)
      .execute();

    const renewed = await visit(link.id, { visitorHandle: first.visitor.handle });
    expect(renewed.layerName).toBe(first.layerName);
    expect((await layerRow(first.layerName))?.last_seen_at).toBeGreaterThan(Date.now() - 60_000);
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
