import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { adminOperations } from '@cloudpdf/contract';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  type AppBundle,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * Registry ⇔ route-table conformance, proven behaviorally: probe every
 * operation's method+path with a valid `*`-scope tenant token. A
 * mounted route reaches app code, which answers with the app's error
 * envelope (`error` is an OBJECT) or a success; an unmounted path falls
 * through to Fastify's router 404, whose default body carries `error`
 * as the STRING "Not Found". That body-shape difference — not the
 * status code — is the mounted/unmounted signal, because app handlers
 * legitimately 404 too (missing doc) and the auth hook runs even for
 * unmatched paths (so unauthenticated probes all 401).
 */

const SECRET = 'registry-conformance-secret';

function substitutedUrl(template: string): string {
  return template
    .replace(':tenantId', 'reg-tenant')
    .replace(':id', 'reg-doc-id')
    .replace(':jti', 'reg-jti');
}

function isRouterNotFound(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 404) return false;
  try {
    const body = JSON.parse(res.body) as { error?: unknown; message?: unknown };
    return typeof body.error === 'string';
  } catch {
    return false;
  }
}

async function buildBundle(opts: { enableRevocation: boolean }): Promise<{
  bundle: AppBundle;
  token: string;
  cleanup: () => Promise<void>;
}> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-admin-registry-'));
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
    enableRevocation: opts.enableRevocation,
  });
  const token = signDevToken(SECRET, {
    sub: 'registry-probe',
    tenant_id: 'reg-tenant',
    scope: ['*'],
  });
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

describe('admin operation registry conformance', () => {
  let fx: Awaited<ReturnType<typeof buildBundle>>;

  beforeAll(async () => {
    fx = await buildBundle({ enableRevocation: false });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  test('every unconditional operation is mounted at its registry method + path', async () => {
    for (const [key, op] of Object.entries(adminOperations)) {
      if (key === 'tokens.revoke') continue;
      const res = await fx.bundle.app.inject({
        method: op.method,
        url: substitutedUrl(op.path),
        headers: { authorization: `Bearer ${fx.token}` },
      });
      expect(
        isRouterNotFound(res),
        `${key} @ ${op.method} ${op.path} → ${res.statusCode} ${res.body.slice(0, 120)}`,
      ).toBe(false);
      expect(res.statusCode, `${key} should not 5xx`).toBeLessThan(500);
    }
  });

  test('tokens.revoke is not mounted without enableRevocation, as its notes say', async () => {
    const op = adminOperations['tokens.revoke'];
    const res = await fx.bundle.app.inject({
      method: op.method,
      url: substitutedUrl(op.path),
      headers: { authorization: `Bearer ${fx.token}` },
    });
    expect(isRouterNotFound(res)).toBe(true);
    expect(op.notes).toMatch(/revocation/i);
  });

  test('paths outside the registry hit the router 404, so the probe is a real signal', async () => {
    const res = await fx.bundle.app.inject({
      method: 'GET',
      url: '/v1/admin/not-a-route',
      headers: { authorization: `Bearer ${fx.token}` },
    });
    expect(isRouterNotFound(res)).toBe(true);
  });
});

describe('admin operation registry conformance (revocation enabled)', () => {
  let fx: Awaited<ReturnType<typeof buildBundle>>;

  beforeAll(async () => {
    fx = await buildBundle({ enableRevocation: true });
  });
  afterAll(async () => {
    await fx.cleanup();
  });

  test('tokens.revoke mounts at its registry method + path and revokes', async () => {
    const op = adminOperations['tokens.revoke'];
    const res = await fx.bundle.app.inject({
      method: op.method,
      url: substitutedUrl(op.path),
      headers: { authorization: `Bearer ${fx.token}` },
    });
    expect(res.statusCode).toBe(204);
  });
});
