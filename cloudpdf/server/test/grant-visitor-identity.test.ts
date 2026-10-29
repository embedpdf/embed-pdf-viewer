/**
 * Who a grant's visitors are. A grant can ask (`visitorIdentity`): when
 * they open it, or before their first change. The answers are given once,
 * stored with the visitor, and put into every token issued for them; one
 * already given is never replaced (a visitor who mistyped starts over). A
 * visitor who hasn't answered what's required can't open a grant that asks
 * on open, and can't change a document whose grant asks before the first
 * change. The grant's visitors are listed with their answers and their layer,
 * and deleting one erases both.
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
const SECRET = 'grant-identity-secret';
const API_TOKEN = 'grant-identity-root-token';
const TENANT = 'tenant-identity';
const DOC = 'doc-identity';
const ORIGIN = 'https://acme.example';

let dir: string;
let db: Kysely<DbSchema>;
let bundle: AppBundle;
let baseUrl: string;

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'grant-identity-'));
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

const LEAD_GATE = {
  fields: { displayName: 'required', email: 'required', organization: 'optional' },
  ask: 'on-open',
  purpose: 'Acme follows up on every quote request.',
  privacyUrl: 'https://acme.example/privacy',
} as const;

const REVIEW = {
  fields: { displayName: 'required' },
  ask: 'before-first-change',
} as const;

const createGrant = (body: Record<string, unknown>) =>
  call('POST', `/v1/tenants/${TENANT}/grants`, {
    token: API_TOKEN,
    body: { docId: DOC, scope: ['*'], ...body },
  });

const updateGrant = (id: string, body: Record<string, unknown>) =>
  call('PATCH', `/v1/tenants/${TENANT}/grants/${id}`, { token: API_TOKEN, body });

const exchange = (body: Record<string, unknown>) =>
  call('POST', '/v1/grant-sessions', { body, origin: ORIGIN });

interface Session {
  token: string;
  layerName: string;
  visitor: { handle: string; identityRequest: Record<string, unknown> | null };
}

/** A grant's session, as its visitor. */
async function visit(grant: string, extra: Record<string, unknown> = {}): Promise<Session> {
  const answer = await exchange({ grant, ...extra });
  expect(answer.status).toBe(200);
  return answer.body as Session;
}

const claimsOf = (token: string) =>
  JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as {
    sub: string;
    identity: Record<string, string>;
    identity_pending?: Record<string, unknown>;
  };

const visitorIdOf = (session: Session) =>
  claimsOf(session.token).identity['userId']!.slice('visitor_'.length);

const visitorRow = (session: Session) =>
  db
    .selectFrom('grant_visitors')
    .selectAll()
    .where('visitor_id', '=', visitorIdOf(session))
    .executeTakeFirst();

const layerRow = (name: string) =>
  db
    .selectFrom('layers')
    .selectAll()
    .where('doc_id', '=', DOC)
    .where('name', '=', name)
    .executeTakeFirst();

const annotate = (session: Session, contents: string) =>
  call('POST', `/v1/docs/${DOC}/layers/${session.layerName}/annotations/pages/obj:1/items`, {
    token: session.token,
    body: highlightDraft(contents),
    origin: ORIGIN,
  });

const read = (session: Session) =>
  call('GET', `/v1/docs/${DOC}/layers/${session.layerName}/annotations/pages/obj:1/items`, {
    token: session.token,
    origin: ORIGIN,
  });

const visitorsOf = (grantId: string, query = '') =>
  call('GET', `/v1/tenants/${TENANT}/grants/${grantId}/visitors${query}`, { token: API_TOKEN });

const deleteVisitor = (grantId: string, visitorId: string) =>
  call('DELETE', `/v1/tenants/${TENANT}/grants/${grantId}/visitors/${visitorId}`, {
    token: API_TOKEN,
  });

describe('what a grant asks', () => {
  test('carries its questions, and can stop asking', async () => {
    const grant = await createGrant({ visitorIdentity: LEAD_GATE });
    expect(grant.status).toBe(200);
    expect(grant.body.grant.visitorIdentity).toEqual(LEAD_GATE);
    const plain = await createGrant({});
    expect(plain.body.grant.visitorIdentity).toBeNull();

    const stopped = await updateGrant(grant.body.grant.id, { visitorIdentity: null });
    expect(stopped.status).toBe(200);
    expect(stopped.body.grant.visitorIdentity).toBeNull();
    const again = await updateGrant(grant.body.grant.id, { visitorIdentity: REVIEW });
    expect(again.body.grant.visitorIdentity).toEqual(REVIEW);
  });

  test('refuses asking nothing, and a privacy page that is not a web page', async () => {
    const nothing = await createGrant({ visitorIdentity: { fields: {}, ask: 'on-open' } });
    expect(nothing.status).toBe(400);
    expect(nothing.body.error.message).toMatch(/ask at least one field/);
    const script = await createGrant({
      visitorIdentity: { ...LEAD_GATE, privacyUrl: 'javascript:alert(1)' },
    });
    expect(script.status).toBe(400);
    expect(script.body.error.message).toMatch(/privacyUrl/);
  });
});

describe('a grant that asks on open', () => {
  test('waits for what it requires, then puts the answers in every token', async () => {
    const grant = (await createGrant({ visitorIdentity: LEAD_GATE })).body.grant;

    const asked = await exchange({ grant: grant.id });
    expect(asked.status).toBe(422);
    expect(asked.body.error).toMatchObject({
      code: 'VisitorIdentityRequired',
      details: {
        fields: LEAD_GATE.fields,
        missing: ['displayName', 'email'],
        invalid: [],
        purpose: LEAD_GATE.purpose,
        privacyUrl: LEAD_GATE.privacyUrl,
      },
    });
    const typo = await exchange({
      grant: grant.id,
      visitorIdentity: { displayName: 'Ada', email: 'ada-at-example' },
    });
    expect(typo.status).toBe(422);
    expect(typo.body.error.details).toMatchObject({ missing: ['email'], invalid: ['email'] });

    const ada = await visit(grant.id, {
      // Trimmed; a field the grant doesn't ask is ignored.
      visitorIdentity: { displayName: '  Ada Lovelace ', email: 'ada@example.com', title: 'CEO' },
    });
    const claims = claimsOf(ada.token);
    expect(claims.identity).toEqual({
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      userId: expect.stringMatching(/^visitor_[0-9a-f]{24}$/),
    });
    expect(claims.identity_pending).toBeUndefined();
    expect(await visitorRow(ada)).toMatchObject({
      grant_id: grant.id,
      display_name: 'Ada Lovelace',
      email: 'ada@example.com',
      title: null,
      organization: null,
      consented_at: expect.any(Number),
    });

    // A renewal needs no answers; ones given again don't replace hers, and
    // one she hadn't given (optional) fills in.
    const renewed = await visit(grant.id, { visitorHandle: ada.visitor.handle });
    expect(claimsOf(renewed.token).identity).toEqual(claims.identity);
    const changed = await visit(grant.id, {
      visitorHandle: renewed.visitor.handle,
      visitorIdentity: { displayName: 'Someone Else', organization: 'Analytical Engines' },
    });
    expect(claimsOf(changed.token).identity).toEqual({
      ...claims.identity,
      organization: 'Analytical Engines',
    });
    expect((await visitorRow(ada))?.display_name).toBe('Ada Lovelace');
  });

  test('starting over is someone new, who is asked again', async () => {
    const grant = (await createGrant({ visitorIdentity: LEAD_GATE })).body.grant;
    const answers = { displayName: 'Grace', email: 'grace@exmaple.com' };
    const first = await visit(grant.id, { visitorIdentity: answers });

    const restarted = { visitorHandle: first.visitor.handle, restart: true };
    expect((await exchange({ grant: grant.id, ...restarted })).status).toBe(422);
    const fixed = await visit(grant.id, {
      ...restarted,
      visitorIdentity: { ...answers, email: 'grace@example.com' },
    });
    expect(claimsOf(fixed.token).identity['email']).toBe('grace@example.com');
    expect(visitorIdOf(fixed)).not.toBe(visitorIdOf(first));
    // On a shared grant what the first visitor wrote stays theirs, answers and all.
    expect(await visitorRow(first)).toBeDefined();
  });
});

describe('a grant that asks before the first change', () => {
  test('lets them read, and refuses their changes until they answer', async () => {
    const grant = (await createGrant({ layerMode: 'per-visitor', visitorIdentity: REVIEW })).body
      .grant;
    const reader = await visit(grant.id);
    const pending = claimsOf(reader.token).identity_pending;
    expect(pending).toEqual({ fields: REVIEW.fields, missing: ['displayName'], invalid: [] });
    expect(reader.visitor.identityRequest).toEqual(pending);
    expect(Object.keys(claimsOf(reader.token).identity)).toEqual(['userId']);
    expect((await read(reader)).status).toBe(200);

    const refused = await annotate(reader, 'too soon');
    expect(refused.status).toBe(403);
    expect(refused.body.error).toMatchObject({
      code: 'VisitorIdentityRequired',
      details: { missing: ['displayName'] },
    });
    expect(await layerRow(reader.layerName)).toBeUndefined();
    expect(await visitorRow(reader)).toBeUndefined();

    const answered = await visit(grant.id, {
      visitorHandle: reader.visitor.handle,
      visitorIdentity: { displayName: 'Reviewer' },
    });
    expect(answered.layerName).toBe(reader.layerName);
    expect(claimsOf(answered.token).identity_pending).toBeUndefined();
    expect(answered.visitor.identityRequest).toBeNull();
    expect(claimsOf(answered.token).identity['displayName']).toBe('Reviewer');
    expect((await annotate(answered, 'looks good')).status).toBe(200);
    expect(await visitorRow(answered)).toMatchObject({ display_name: 'Reviewer' });
  });

  test('refuses answers it can’t take at once', async () => {
    const grant = (
      await createGrant({
        visitorIdentity: { fields: { email: 'optional' }, ask: 'before-first-change' },
      })
    ).body.grant;
    const bad = await exchange({ grant: grant.id, visitorIdentity: { email: 'nope' } });
    expect(bad.status).toBe(422);
    expect(bad.body.error.details).toMatchObject({ missing: [], invalid: ['email'] });
    // Nothing required: no answers is fine, and nothing is pending.
    const quiet = await visit(grant.id);
    expect(claimsOf(quiet.token).identity_pending).toBeUndefined();
  });
});

describe('a grant that says who its visitors are', () => {
  const DANA = { displayName: 'Dana Smith', email: 'dana@client.example' };

  test('carries its identity, which can be replaced and cleared', async () => {
    const grant = await createGrant({ identity: DANA });
    expect(grant.status).toBe(200);
    expect(grant.body.grant.identity).toEqual(DANA);
    expect((await createGrant({})).body.grant.identity).toBeNull();

    const replaced = await updateGrant(grant.body.grant.id, {
      identity: { displayName: 'Dana S.' },
    });
    expect(replaced.body.grant.identity).toEqual({ displayName: 'Dana S.' });
    const cleared = await updateGrant(grant.body.grant.id, { identity: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.grant.identity).toBeNull();
  });

  test('refuses saying nothing, and asking what it says', async () => {
    const nothing = await createGrant({ identity: {} });
    expect(nothing.status).toBe(400);
    expect(nothing.body.error.message).toMatch(/identity: set at least one field/);
    const both = await createGrant({ identity: DANA, visitorIdentity: REVIEW });
    expect(both.status).toBe(400);
    expect(both.body.error.message).toMatch(/sets displayName, so it can't ask for it/);

    // An update is checked against the grant as it will be.
    const asking = (await createGrant({ visitorIdentity: REVIEW })).body.grant;
    const added = await updateGrant(asking.id, { identity: DANA });
    expect(added.status).toBe(400);
    const swapped = await updateGrant(asking.id, { identity: DANA, visitorIdentity: null });
    expect(swapped.status).toBe(200);
    expect((await updateGrant(asking.id, { visitorIdentity: REVIEW })).status).toBe(400);
  });

  test('puts it in every token, over the answers, and asks only the rest', async () => {
    const grant = (
      await createGrant({
        layerMode: 'per-visitor',
        identity: { displayName: 'Dana Smith' },
        visitorIdentity: { fields: { email: 'required' }, ask: 'on-open' },
      })
    ).body.grant;
    const asked = await exchange({ grant: grant.id });
    expect(asked.status).toBe(422);
    expect(asked.body.error.details).toMatchObject({ missing: ['email'] });

    // A name of their own isn't asked, so it's ignored; the email is theirs.
    const dana = await visit(grant.id, {
      visitorIdentity: { displayName: 'Someone Else', email: 'dana@client.example' },
    });
    expect(claimsOf(dana.token).identity).toEqual({
      displayName: 'Dana Smith',
      email: 'dana@client.example',
      userId: expect.stringMatching(/^visitor_[0-9a-f]{24}$/),
    });
    expect(await visitorRow(dana)).toMatchObject({
      display_name: null,
      email: 'dana@client.example',
    });
    expect((await annotate(dana, 'from Dana')).status).toBe(200);
  });

  test('a userId it sets replaces the visitor’s own; each visit still has its own layer', async () => {
    const grant = (
      await createGrant({ layerMode: 'per-visitor', identity: { userId: 'crm_42', ...DANA } })
    ).body.grant;
    const first = await visit(grant.id);
    const second = await visit(grant.id);
    expect(claimsOf(first.token).identity).toEqual({ userId: 'crm_42', ...DANA });
    expect(claimsOf(second.token).identity).toEqual({ userId: 'crm_42', ...DANA });
    expect(first.layerName).not.toBe(second.layerName);
  });
});

describe("a grant's visitors", () => {
  test('lists who answered or wrote, newest first, a page at a time, with their layer', async () => {
    const grant = (
      await createGrant({
        layerMode: 'per-visitor',
        visitorIdentity: { fields: { displayName: 'required' }, ask: 'on-open' },
      })
    ).body.grant;
    const ann = await visit(grant.id, { visitorIdentity: { displayName: 'Ann' } });
    const ben = await visit(grant.id, { visitorIdentity: { displayName: 'Ben' } });
    // Only looking (a 422) makes no visitor.
    expect((await exchange({ grant: grant.id })).status).toBe(422);
    expect((await annotate(ann, 'from ann')).status).toBe(200);
    await db
      .updateTable('grant_visitors')
      .set({ first_seen_at: 1000 })
      .where('visitor_id', '=', visitorIdOf(ann))
      .execute();

    const first = await visitorsOf(grant.id, '?limit=1');
    expect(first.status).toBe(200);
    expect(first.body.visitors).toEqual([
      {
        visitorId: visitorIdOf(ben),
        answers: { displayName: 'Ben' },
        emailVerified: false,
        consentedAt: expect.any(Number),
        firstSeenAt: expect.any(Number),
        lastSeenAt: expect.any(Number),
        layer: null,
      },
    ]);
    expect(first.body.nextCursor).toEqual(expect.any(String));
    const second = await visitorsOf(grant.id, `?limit=1&cursor=${first.body.nextCursor}`);
    expect(second.body.visitors).toEqual([
      expect.objectContaining({
        visitorId: visitorIdOf(ann),
        answers: { displayName: 'Ann' },
        firstSeenAt: 1000,
        layer: { layerName: ann.layerName, storageSizeBytes: expect.any(Number) },
      }),
    ]);
    expect(second.body.nextCursor).toBeNull();

    expect((await visitorsOf('shr_doesnotexist000000000000')).status).toBe(404);
    expect((await visitorsOf(grant.id, '?limit=0')).status).toBe(400);
  });

  test('deleting one erases their answers and layer; their handle comes back asked again', async () => {
    const grant = (await createGrant({ layerMode: 'per-visitor', visitorIdentity: LEAD_GATE })).body
      .grant;
    const ann = await visit(grant.id, {
      visitorIdentity: { displayName: 'Ann', email: 'ann@example.com' },
    });
    expect((await annotate(ann, 'mine')).status).toBe(200);

    expect((await deleteVisitor(grant.id, visitorIdOf(ann))).status).toBe(204);
    expect(await visitorRow(ann)).toBeUndefined();
    expect((await layerRow(ann.layerName))?.deleted_at).not.toBeNull();
    expect((await visitorsOf(grant.id)).body.visitors).toEqual([]);
    const back = await exchange({ grant: grant.id, visitorHandle: ann.visitor.handle });
    expect(back.status).toBe(422);
    // Again changes nothing; a malformed id is refused.
    expect((await deleteVisitor(grant.id, visitorIdOf(ann))).status).toBe(204);
    expect((await deleteVisitor(grant.id, 'not-a-visitor')).status).toBe(400);
    expect((await deleteVisitor('shr_doesnotexist000000000000', visitorIdOf(ann))).status).toBe(
      404,
    );
  });

  test('a grant whose visitors only answered is archived, not deleted, and still lists them', async () => {
    const grant = (await createGrant({ visitorIdentity: LEAD_GATE })).body.grant;
    const lead = await visit(grant.id, {
      visitorIdentity: { displayName: 'Lead', email: 'lead@example.com' },
    });
    const deleteGrant = () =>
      call('DELETE', `/v1/tenants/${TENANT}/grants/${grant.id}`, { token: API_TOKEN });
    const refused = await deleteGrant();
    expect(refused.status).toBe(409);
    expect(refused.body.error.details).toEqual({ visitors: 1, visitorLayers: 0 });

    const archived = await call('POST', `/v1/tenants/${TENANT}/grants/${grant.id}/archive`, {
      token: API_TOKEN,
    });
    expect(archived.status).toBe(200);
    expect((await visitorsOf(grant.id)).body.visitors).toHaveLength(1);
    expect((await deleteVisitor(grant.id, visitorIdOf(lead))).status).toBe(204);
    expect((await deleteGrant()).status).toBe(204);
  });
});
