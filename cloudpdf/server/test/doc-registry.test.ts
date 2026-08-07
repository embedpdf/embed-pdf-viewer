import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { docOperations } from '@cloudpdf/contract';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  sqliteMigrations,
  type AppBundle,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * Doc-plane registry ⇔ route-table conformance. Unlike the admin
 * surfaces, doc-plane routes are mounted by their own plane files, not
 * from the registry — so this test is the drift guard: every
 * registered doc operation must exist on the wire at its method+path.
 *
 * The probe needs no seeded document or worker: with a valid API token
 * and a nonexistent docId, a MOUNTED route reaches the api-token
 * synthesis hook, which answers an app-envelope 404 (`error` is an
 * OBJECT); an UNMOUNTED path falls through to Fastify's router 404,
 * whose default body carries `error` as the STRING "Not Found".
 */

const API_TOKEN = 'doc-registry-root-token';
const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);

function substitutedUrl(template: string): string {
  return template
    .replace(':docId', 'reg-missing-doc')
    .replace(':layerName', 'default')
    .replace(':pon', '1')
    .replace(':annotKey', 'reg-annot')
    .replace(':fieldKey', 'reg-field');
}

function isRouterNotFound(res: { statusCode: number; body: string }): boolean {
  if (res.statusCode !== 404) return false;
  try {
    const body = JSON.parse(res.body) as { error?: unknown };
    return typeof body.error === 'string';
  } catch {
    return false;
  }
}

describe('doc-plane registry conformance', () => {
  let bundle: AppBundle;
  let storageRoot: string;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-doc-registry-'));
    // The /v1/docs/* plane mounts only when a worker pool + cache exist,
    // so the fixture runs the stub worker like the doc-plane e2e does.
    const cacheRoot = await mkdtemp(join(tmpdir(), 'embedpdf-doc-registry-cache-'));
    const db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: 'doc-registry-secret' },
      apiAuthTokens: [API_TOKEN],
      workerEntry: STUB_ENTRY,
      poolSize: 1,
      db,
      objectStore: new FsObjectStore({ root: storageRoot }),
      autoProvisionTenant: true,
      sweepIntervalMs: 0,
      cacheRoot,
      cacheMaxBytes: 1024 * 1024,
    });
    cleanup = async () => {
      await bundle.shutdown();
      await db.destroy();
      await rm(storageRoot, { recursive: true, force: true });
      await rm(cacheRoot, { recursive: true, force: true });
    };
  });
  afterAll(async () => {
    await cleanup();
  });

  test('every doc-plane operation is mounted at its registry method + path', async () => {
    for (const [key, op] of Object.entries(docOperations)) {
      const res = await bundle.app.inject({
        method: op.method,
        url: substitutedUrl(op.path),
        headers: { authorization: `Bearer ${API_TOKEN}` },
      });
      expect(
        isRouterNotFound(res),
        `${key} @ ${op.method} ${op.path} → ${res.statusCode} ${res.body.slice(0, 120)}`,
      ).toBe(false);
      expect(res.statusCode, `${key} should not 5xx`).toBeLessThan(500);
    }
  });

  test('a path outside the doc-plane registry hits the router 404, keeping the probe honest', async () => {
    const res = await bundle.app.inject({
      method: 'GET',
      url: '/v1/docs/reg-missing-doc/not-a-route',
      headers: { authorization: `Bearer ${API_TOKEN}` },
    });
    expect(isRouterNotFound(res)).toBe(true);
  });
});
