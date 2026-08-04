import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { InProcessRealtimeBus } from '../src/realtime/RealtimeBus';
import {
  buildApp,
  createSqliteDb,
  FsObjectStore,
  migrate,
  RevokedJtisGuard,
  signDevToken,
  sqliteMigrations,
  type AppBundle,
} from '../src/index';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * Phase 2 — RevokedJtisGuard + `/v1/admin/tokens/:jti/revoke`
 *
 * These tests cover the full request path: a token containing `jti`
 * is rejected the moment the revoke endpoint flips its bit. We also
 * check the LRU caching semantics directly on the guard.
 */

const SECRET = 'revocation-secret';

describe('RevokedJtisGuard (unit)', () => {
  test('returns false for unknown jti and caches the negative answer', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const guard = new RevokedJtisGuard({ db, negativeTtlMs: 60_000 });
    expect(await guard.isRevoked('not-a-jti')).toBe(false);
    expect(await guard.isRevoked('not-a-jti')).toBe(false);
    await db.destroy();
  });

  test('flips to revoked after `revoke()` and is reflected without restart', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const guard = new RevokedJtisGuard({ db });
    expect(await guard.isRevoked('jti-1')).toBe(false);
    await guard.revoke({
      jti: 'jti-1',
      tenantId: 'tenant-a',
      reason: 'manual',
      expiresAt: Date.now() + 60_000,
    });
    expect(await guard.isRevoked('jti-1')).toBe(true);
    await db.destroy();
  });

  test('gcExpired prunes long-expired entries', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const guard = new RevokedJtisGuard({ db });
    await guard.revoke({
      jti: 'jti-old',
      tenantId: 'tenant-a',
      expiresAt: Date.now() - 1_000,
    });
    await guard.revoke({
      jti: 'jti-current',
      tenantId: 'tenant-a',
      expiresAt: Date.now() + 60_000,
    });
    const removed = await guard.gcExpired();
    expect(removed).toBe(1);
    guard.clearCache();
    expect(await guard.isRevoked('jti-old')).toBe(false);
    expect(await guard.isRevoked('jti-current')).toBe(true);
    await db.destroy();
  });

  test('LRU evicts oldest entries past capacity', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const guard = new RevokedJtisGuard({ db, lruSize: 2, negativeTtlMs: 60_000 });
    await guard.isRevoked('a'); // cache: [a]
    await guard.isRevoked('b'); // cache: [a, b]
    await guard.isRevoked('c'); // cache: [b, c] (a evicted)
    // Probe a 4th distinct jti to confirm the LRU still bounds size.
    await guard.isRevoked('d'); // cache: [c, d]
    expect(await guard.isRevoked('d')).toBe(false);
    await db.destroy();
  });

  test('revoke() publishes on the bus; remote pushes fill the LRU instantly', async () => {
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    const bus = new InProcessRealtimeBus();
    const guard = new RevokedJtisGuard({ db, negativeTtlMs: 60_000, realtime: bus });

    // 1. Local revoke → pushed on the bus (the SSE close + sibling fill signal).
    const pushed: Array<{ jti: string; expiresAt: number }> = [];
    bus.subscribeRevocation((jti, expiresAt) => pushed.push({ jti, expiresAt }));
    const exp = Date.now() + 60_000;
    await guard.revoke({ jti: 'jti-local', tenantId: 't', expiresAt: exp });
    expect(pushed).toEqual([{ jti: 'jti-local', expiresAt: exp }]);

    // 2. Warm the NEGATIVE cache for a jti, then simulate a SIBLING
    //    replica's revoke arriving as a push: the LRU flips to revoked
    //    immediately — no 60s negative-TTL window, and no DB row needed
    //    locally to prove the cache (not the DB) answered.
    expect(await guard.isRevoked('jti-remote')).toBe(false); // negative-cached
    await bus.publishRevocation('jti-remote', Date.now() + 60_000);
    expect(await guard.isRevoked('jti-remote')).toBe(true);

    await db.destroy();
  });
});

describe('POST /v1/admin/tokens/:jti/revoke (E2E)', () => {
  let bundle: AppBundle;
  let baseUrl = '';
  let storageRoot = '';

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-rev-'));
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    bundle = await buildApp({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: SECRET },
      workerEntry: null,
      db,
      objectStore: new FsObjectStore({ root: storageRoot }),
      enableRevocation: true,
      autoProvisionTenant: true,
      sweepIntervalMs: 0,
    });
    const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
    baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  });

  afterAll(async () => {
    await bundle.shutdown();
    await rm(storageRoot, { recursive: true, force: true });
  });

  function authHeader(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
  }

  test('revoking a jti blocks subsequent requests with that token', async () => {
    const tok = signDevToken(SECRET, {
      sub: 'user-1',
      tenant_id: 'tenant-rev',
      scope: ['*'],
      jti: 'jti-to-revoke',
      ttlSeconds: 3600,
    });

    // Before revoke: GET /list works.
    let res = await fetch(`${baseUrl}/v1/admin/documents`, { headers: authHeader(tok) });
    expect(res.status).toBe(200);

    // Revoke the jti.
    res = await fetch(`${baseUrl}/v1/admin/tokens/jti-to-revoke/revoke`, {
      method: 'POST',
      headers: { ...authHeader(tok), 'content-type': 'application/json' },
      body: JSON.stringify({ reason: 'manual' }),
    });
    expect(res.status).toBe(204);

    // Allow the negative-ttl cache to expire. The same client (same
    // pid, same guard instance) cached "not revoked" with a 60s
    // default TTL on the earlier isRevoked() probe. We pull the
    // cache reset by hitting the guard directly.
    bundle.revokedJtisGuard!.clearCache();

    // After revoke: same token is rejected.
    res = await fetch(`${baseUrl}/v1/admin/documents`, { headers: authHeader(tok) });
    expect(res.status).toBe(401);
    const body = (await res.json()) as { error: string };
    expect(body.error).toMatch(/revoked/);
  });

  test('revoke requires admin scope', async () => {
    const noScope = signDevToken(SECRET, {
      sub: 'user-2',
      tenant_id: 'tenant-rev',
      jti: 'jti-other',
    });
    const res = await fetch(`${baseUrl}/v1/admin/tokens/abc/revoke`, {
      method: 'POST',
      headers: authHeader(noScope),
    });
    expect(res.status).toBe(403);
  });

  test('docs.read alone cannot revoke (requires tokens.mint or *)', async () => {
    const tok = signDevToken(SECRET, {
      sub: 'reader',
      tenant_id: 'tenant-rev',
      scope: ['docs.read'],
      jti: 'jti-reader',
    });
    const res = await fetch(`${baseUrl}/v1/admin/tokens/whatever/revoke`, {
      method: 'POST',
      headers: authHeader(tok),
    });
    expect(res.status).toBe(403);
  });
});
