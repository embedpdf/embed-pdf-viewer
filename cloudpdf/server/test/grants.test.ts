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
  signDevToken,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * The grant family end to end: grant lifecycle under
 * /v1/tenants/:tenantId/grants, the public /v1/grant-sessions
 * exchange (origin allowlists, passphrases, disable/expiry/revoke),
 * origin-locked doc JWTs, per-tenant usage facts with the
 * exchange-vs-access dedupe, tenant suspend/resume, and CORS
 * preflight on the public route.
 */

const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);
const SECRET = 'grants-secret';
const API_TOKEN = 'grants-root-token';
const TENANT = 'acme';

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
  const storageRoot = await mkdtemp(join(tmpdir(), 'grants-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'grants-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    apiAuthTokens: [API_TOKEN],
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    corsOrigins: '*',
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

function tenantToken(scope: string[] = ['*']): string {
  return signDevToken(SECRET, { sub: 'backend-1', tenant_id: TENANT, scope });
}

async function seedDocument(docId: string): Promise<void> {
  const padding = randomBytes(4095);
  const bytes = new Uint8Array(4096);
  bytes[0] = 3; // stub page count
  bytes.set(padding, 1);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const storage = new FsObjectStore({ root: fx.storageRoot });
  await storage.put(StorageKeys.basePdf(TENANT, docId), bytes, {
    contentLength: bytes.byteLength,
  });
  await fx.db
    .insertInto('tenants')
    .values({ id: TENANT, name: TENANT })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: TENANT,
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

async function createGrant(
  body: Record<string, unknown>,
  auth: string = tenantToken(['grants.manage']),
): Promise<{ status: number; grant?: Record<string, any> }> {
  const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${auth}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const payload =
    res.status === 200 ? ((await res.json()) as { grant: Record<string, any> }) : undefined;
  return { status: res.status, ...(payload ? { grant: payload.grant } : {}) };
}

async function exchange(
  body: Record<string, unknown>,
  origin?: string,
): Promise<{ status: number; json: any; headers: Headers }> {
  const res = await fetch(`${fx.baseUrl}/v1/grant-sessions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(origin !== undefined ? { origin } : {}),
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: await res.json().catch(() => null), headers: res.headers };
}

async function usageSnapshot(): Promise<{ metrics: Record<string, number> }> {
  const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/usage`, {
    headers: { Authorization: `Bearer ${API_TOKEN}` },
  });
  expect(res.status).toBe(200);
  return (await res.json()) as { metrics: Record<string, number> };
}

async function head(docId: string, token: string, origin?: string): Promise<number> {
  const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}/head`, {
    headers: {
      Authorization: `Bearer ${token}`,
      ...(origin !== undefined ? { origin } : {}),
    },
  });
  return res.status;
}

describe('grants', () => {
  test('grant lifecycle + public exchange, end to end', async () => {
    await seedDocument('doc-grant');

    // Create requires the scope.
    const denied = await createGrant(
      { docId: 'doc-grant', scope: ['doc.open'] },
      tenantToken(['docs.read']),
    );
    expect(denied.status).toBe(403);

    const created = await createGrant({
      docId: 'doc-grant',
      scope: ['doc.open', 'doc.render', 'doc.text.select'],
      origins: ['https://acme.com', 'https://*.acme.dev'],
    });
    expect(created.status).toBe(200);
    const grant = created.grant!;
    expect(grant.id).toMatch(/^grt_[A-Za-z0-9_-]{24}$/);
    expect(grant.passphraseProtected).toBe(false);
    expect(grant.name).toBeNull();
    expect(grant.origins).toEqual(['https://acme.com', 'https://*.acme.dev']);

    // Unknown document → 404; foreign tenant doc binding is covered by
    // requireOwned tests elsewhere.
    const missing = await createGrant({ docId: 'doc-nope', scope: ['doc.open'] });
    expect(missing.status).toBe(404);

    // Exchange: allowed origin → session that opens the document.
    const ok = await exchange({ grant: grant.id }, 'https://acme.com');
    expect(ok.status).toBe(200);
    expect(ok.json.docId).toBe('doc-grant');
    expect(ok.json.layerName).toBe('default');
    expect(ok.json.expiresAt).toBeGreaterThan(Math.floor(Date.now() / 1000) + 500);
    expect(await head('doc-grant', ok.json.token, 'https://acme.com')).toBe(200);

    // Wildcard subdomain matches one-or-more labels; the bare apex does not.
    expect((await exchange({ grant: grant.id }, 'https://docs.acme.dev')).status).toBe(200);
    expect((await exchange({ grant: grant.id }, 'https://acme.dev')).status).toBe(403);
    expect((await exchange({ grant: grant.id }, 'https://evilacme.com')).status).toBe(403);

    // Origin is mandatory on the public exchange.
    expect((await exchange({ grant: grant.id })).status).toBe(403);

    // The origin lock is stamped into the session JWT: presenting it
    // from a different browser origin fails, absent Origin (curl) passes.
    expect(await head('doc-grant', ok.json.token, 'https://evil.com')).toBe(403);
    expect(await head('doc-grant', ok.json.token)).toBe(200);

    // Unknown token: indistinguishable 404.
    const unknown = await exchange({ grant: `shr_${'A'.repeat(24)}` }, 'https://acme.com');
    expect(unknown.status).toBe(404);

    // Update: disable pauses exchange with the same 404; re-enable restores.
    const patch = async (body: Record<string, unknown>) =>
      fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants/${grant.id}`, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${tenantToken(['grants.manage'])}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(body),
      });
    expect((await patch({ disabled: true })).status).toBe(200);
    expect((await exchange({ grant: grant.id }, 'https://acme.com')).status).toBe(404);
    expect((await patch({ disabled: false })).status).toBe(200);
    expect((await exchange({ grant: grant.id }, 'https://acme.com')).status).toBe(200);

    // Expiry → 410 Gone (distinct from revocation: the embed can say "expired").
    expect((await patch({ expiresAt: Date.now() - 1_000 })).status).toBe(200);
    expect((await exchange({ grant: grant.id }, 'https://acme.com')).status).toBe(410);
    expect((await patch({ expiresAt: null })).status).toBe(200);

    // Editing origins retargets already-pasted embeds at the next exchange.
    expect((await patch({ origins: ['https://other.com'] })).status).toBe(200);
    expect((await exchange({ grant: grant.id }, 'https://acme.com')).status).toBe(403);
    expect((await exchange({ grant: grant.id }, 'https://other.com')).status).toBe(200);

    // Revoke: delete stops exchange immediately.
    const del = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants/${grant.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${tenantToken(['grants.manage'])}` },
    });
    expect(del.status).toBe(204);
    expect((await exchange({ grant: grant.id }, 'https://other.com')).status).toBe(404);

    // The lifecycle is on the security trail; exchanges are not.
    const events = await fx.db
      .selectFrom('security_events')
      .select(['kind', 'jti'])
      .where('tenant_id', '=', TENANT)
      .execute();
    const kinds = events.filter((e) => e.jti === grant.id).map((e) => e.kind);
    expect(kinds).toContain('grant.created');
    expect(kinds).toContain('grant.updated');
    expect(kinds).toContain('grant.revoked');
    expect(kinds.filter((k) => k === 'grant.exchanged')).toHaveLength(0);
  });

  test('passphrase-protected grants', async () => {
    await seedDocument('doc-pass');
    const created = await createGrant({
      docId: 'doc-pass',
      scope: ['doc.open'],
      passphrase: 'q3-review',
    });
    expect(created.status).toBe(200);
    expect(created.grant!.passphraseProtected).toBe(true);

    const noPass = await exchange({ grant: created.grant!.id }, 'https://any.example');
    expect(noPass.status).toBe(422);
    expect(noPass.json.error.code).toBe('GrantPassphraseRequired');

    const wrong = await exchange(
      { grant: created.grant!.id, passphrase: 'nope' },
      'https://any.example',
    );
    expect(wrong.status).toBe(422);

    const right = await exchange(
      { grant: created.grant!.id, passphrase: 'q3-review' },
      'https://any.example',
    );
    expect(right.status).toBe(200);

    // The envelope never leaves the row.
    const got = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants/${created.grant!.id}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    const body = (await got.json()) as { grant: Record<string, unknown> };
    expect(body.grant['passphraseProtected']).toBe(true);
    expect(JSON.stringify(body)).not.toContain('scrypt');
  });

  test('a name: trimmed, renamed and removed', async () => {
    await seedDocument('doc-named');
    const created = await createGrant({
      docId: 'doc-named',
      scope: ['doc.open'],
      name: '  Website  ',
    });
    expect(created.status).toBe(200);
    expect(created.grant!.name).toBe('Website');

    const patch = async (body: Record<string, unknown>) => {
      const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants/${created.grant!.id}`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      return { status: res.status, json: (await res.json()) as any };
    };
    const renamed = await patch({ name: 'Sent to Acme' });
    expect(renamed.json.grant.name).toBe('Sent to Acme');
    // Other edits leave it alone.
    expect((await patch({ disabled: false })).json.grant.name).toBe('Sent to Acme');
    expect((await patch({ name: null })).json.grant.name).toBeNull();

    expect((await patch({ name: '   ' })).status).toBe(400);
    expect((await patch({ name: 'x'.repeat(101) })).status).toBe(400);
    expect((await createGrant({ docId: 'doc-named', scope: ['doc.open'], name: '' })).status).toBe(
      400,
    );
  });

  test('grants made before the rename keep their shr_ id', async () => {
    await seedDocument('doc-older');
    const id = `shr_${'k'.repeat(24)}`;
    await fx.db
      .insertInto('grants')
      .values({
        id,
        tenant_id: TENANT,
        doc_id: 'doc-older',
        name: null,
        layer_mode: 'shared',
        layer_name: 'default',
        keep_visitor_layers: 1,
        visitor_idle_seconds: null,
        visitor_identity_json: null,
        identity_json: null,
        scope_json: '["doc.open"]',
        origins_json: null,
        passphrase_hash: null,
        session_ttl_seconds: 600,
        disabled: 0,
        archived_at: null,
        expires_at: null,
        exchange_count: 0,
        last_exchanged_at: null,
        created_by: 'test',
        created_at: 1,
        updated_at: 1,
      })
      .execute();

    const ok = await exchange({ grant: id }, 'https://acme.com');
    expect(ok.status).toBe(200);
    expect(ok.json.docId).toBe('doc-older');
    const got = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/grants/${id}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    expect(got.status).toBe(200);
    expect(((await got.json()) as { grant: { id: string } }).grant.id).toBe(id);
  });

  test('views: exchange counts once, /v1/access dedupes grant sessions', async () => {
    await seedDocument('doc-views');
    const before = (await usageSnapshot()).metrics['pdf.views']!;

    const created = await createGrant({ docId: 'doc-views', scope: ['doc.open', 'doc.render'] });
    const session = await exchange({ grant: created.grant!.id }, 'https://viewer.example');
    expect(session.status).toBe(200);
    expect((await usageSnapshot()).metrics['pdf.views']).toBe(before + 1);

    // The grant session establishing access is not a second view.
    const access = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${session.json.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ docId: 'doc-views' }),
    });
    expect(access.status).toBe(200);
    expect((await usageSnapshot()).metrics['pdf.views']).toBe(before + 1);

    // An ordinary viewer session (backend-minted doc JWT) counts at /v1/access.
    const viewerJwt = signDevToken(SECRET, {
      sub: 'user-42',
      tenant_id: TENANT,
      doc_id: 'doc-views',
      scope: ['doc.open'],
    });
    const access2 = await fetch(`${fx.baseUrl}/v1/access`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${viewerJwt}`, 'content-type': 'application/json' },
      body: JSON.stringify({ docId: 'doc-views' }),
    });
    expect(access2.status).toBe(200);
    expect((await usageSnapshot()).metrics['pdf.views']).toBe(before + 2);

    // storage.bytes reflects the seeded ready documents.
    expect((await usageSnapshot()).metrics['storage.bytes']).toBeGreaterThan(0);
  });

  test('origin-locked doc JWTs minted via tokens.issue', async () => {
    await seedDocument('doc-locked');
    const res = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/tokens`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'doc',
        sub: 'user-7',
        docId: 'doc-locked',
        scope: ['doc.open'],
        origins: ['https://portal.acme.com'],
        expiresIn: 600,
      }),
    });
    expect(res.status).toBe(200);
    const { token } = (await res.json()) as { token: string };
    expect(await head('doc-locked', token, 'https://portal.acme.com')).toBe(200);
    expect(await head('doc-locked', token, 'https://elsewhere.com')).toBe(403);
    expect(await head('doc-locked', token)).toBe(200);
  });

  test('tenant suspension fails every JWT closed; the API token is exempt', async () => {
    await seedDocument('doc-suspend');
    const created = await createGrant({ docId: 'doc-suspend', scope: ['doc.open'] });
    const session = await exchange({ grant: created.grant!.id }, 'https://any.example');
    expect(session.status).toBe(200);

    const suspend = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/suspend`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}`, 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'billing failure' }),
    });
    expect(suspend.status).toBe(204);

    // Every credential class in the namespace goes dark…
    const headStatus = await fetch(`${fx.baseUrl}/v1/docs/doc-suspend/head`, {
      headers: { Authorization: `Bearer ${session.json.token}` },
    });
    expect(headStatus.status).toBe(403);
    expect(headStatus.headers.get('x-cloudpdf-tenant-status')).toBe('suspended');
    const tenantList = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/documents`, {
      headers: { Authorization: `Bearer ${tenantToken()}` },
    });
    expect(tenantList.status).toBe(403);
    expect((await exchange({ grant: created.grant!.id }, 'https://any.example')).status).toBe(404);

    // …while the operator keeps full reach.
    const inspect = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}`, {
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    expect(inspect.status).toBe(200);
    expect(((await inspect.json()) as any).tenant.status).toBe('suspended');

    const resume = await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/resume`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${API_TOKEN}` },
    });
    expect(resume.status).toBe(204);
    expect((await exchange({ grant: created.grant!.id }, 'https://any.example')).status).toBe(200);

    const trail = await fx.db
      .selectFrom('security_events')
      .select('kind')
      .where('tenant_id', '=', TENANT)
      .execute();
    const kinds = trail.map((e) => e.kind);
    expect(kinds).toContain('tenant.suspended');
    expect(kinds).toContain('tenant.resumed');
  });

  test('a grant to a document in a deleted folder stops at once', async () => {
    await seedDocument('doc-in-folder');
    const auth = { Authorization: `Bearer ${tenantToken()}`, 'content-type': 'application/json' };
    const folder = (await (
      await fetch(`${fx.baseUrl}/v1/tenants/${TENANT}/folders`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ name: 'Shared' }),
      })
    ).json()) as { folder: { id: string } };
    const moved = await fetch(
      `${fx.baseUrl}/v1/tenants/${TENANT}/folders/${folder.folder.id}/move-into`,
      { method: 'POST', headers: auth, body: JSON.stringify({ documentIds: ['doc-in-folder'] }) },
    );
    expect(moved.status).toBe(204);
    const grant = (await createGrant({ docId: 'doc-in-folder', scope: ['doc.open'] })).grant!;
    expect((await exchange({ grant: grant.id }, 'https://acme.com')).status).toBe(200);

    const deleted = await fetch(
      `${fx.baseUrl}/v1/tenants/${TENANT}/folders/${folder.folder.id}?recursive=true`,
      { method: 'DELETE', headers: { Authorization: `Bearer ${tenantToken()}` } },
    );
    expect(deleted.status).toBe(204);
    expect((await exchange({ grant: grant.id }, 'https://acme.com')).status).toBe(404);
  });

  test('CORS preflight on the public exchange', async () => {
    const res = await fetch(`${fx.baseUrl}/v1/grant-sessions`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://anywhere.example',
        'access-control-request-method': 'POST',
        'access-control-request-headers': 'content-type',
      },
    });
    expect([200, 204]).toContain(res.status);
    expect(res.headers.get('access-control-allow-origin')).toBe('https://anywhere.example');
  });
});
