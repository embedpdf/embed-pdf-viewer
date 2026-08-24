import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const API_TOKEN = 'empty-json-body-api-token';

/**
 * Bodyless requests that still advertise `Content-Type: application/json`.
 *
 * The Fern PHP/Go/Ruby SDKs stamp that header on every JSON-API call, body
 * or not, so a plain SDK `documents.delete()` arrives exactly like this.
 * Fastify's stock parser turned it into FST_ERR_CTP_EMPTY_JSON_BODY, and the
 * error handler — which only recognized service errors' `status` — escalated
 * the intended 400 into an "unhandled error" 500.
 */
describe('bodyless requests with a JSON content type', () => {
  let bundle: AppBundle;
  let db: Kysely<DbSchema>;
  let storageRoot: string;

  beforeAll(async () => {
    storageRoot = await mkdtemp(join(tmpdir(), 'embedpdf-empty-json-'));
    db = createSqliteDb({ path: ':memory:' });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: 'empty-json-body-secret' },
      apiAuthTokens: [API_TOKEN],
      workerEntry: null,
      db,
      objectStore: new FsObjectStore({ root: storageRoot }),
      autoProvisionTenant: true,
      sweepIntervalMs: 0,
    });
  });

  afterAll(async () => {
    await bundle.shutdown();
    await db.destroy();
    await rm(storageRoot, { recursive: true, force: true });
  });

  const auth = { authorization: `Bearer ${API_TOKEN}` };

  test('bodyless DELETE carrying the stray JSON header succeeds', async () => {
    const res = await bundle.app.inject({
      method: 'DELETE',
      url: '/v1/tenants/local/documents/no-such-doc',
      headers: { ...auth, 'content-type': 'application/json' },
    });
    // Delete is idempotent, so a missing doc is still a 204. Before the
    // tolerant parser this request died with a 500 before the handler ran.
    expect(res.statusCode).toBe(204);
  });

  test('the charset-parameter variant of the header is tolerated too', async () => {
    const res = await bundle.app.inject({
      method: 'DELETE',
      url: '/v1/tenants/local/documents/no-such-doc',
      headers: { ...auth, 'content-type': 'application/json; charset=utf-8' },
    });
    expect(res.statusCode).toBe(204);
  });

  test('a bodyless DELETE with no content type keeps working', async () => {
    const res = await bundle.app.inject({
      method: 'DELETE',
      url: '/v1/tenants/local/documents/no-such-doc',
      headers: auth,
    });
    expect(res.statusCode).toBe(204);
  });

  test('an empty body does not satisfy a route that requires one', async () => {
    const res = await bundle.app.inject({
      method: 'POST',
      url: '/v1/tenants/local/documents/init',
      headers: { ...auth, 'content-type': 'application/json' },
    });
    // Tolerance yields `req.body === undefined`; the handler's zod parse
    // still rejects it as a client error.
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'InvalidArg' } });
  });

  test('a valid JSON body still parses and reaches the handler', async () => {
    const res = await bundle.app.inject({
      method: 'POST',
      url: '/v1/tenants/local/documents/init',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '{}',
    });
    // {} parses fine and fails the handler's schema — proof the non-empty
    // path still delegates to the real parser.
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: { code: 'InvalidArg' } });
  });

  test("malformed JSON maps to Fastify's 400, not an unhandled 500", async () => {
    const res = await bundle.app.inject({
      method: 'POST',
      url: '/v1/tenants/local/documents/init',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '{"contentLength":',
    });
    expect(res.statusCode).toBe(400);
  });

  test('prototype-poisoning protection survives the tolerant parser', async () => {
    const res = await bundle.app.inject({
      method: 'POST',
      url: '/v1/tenants/local/documents/init',
      headers: { ...auth, 'content-type': 'application/json' },
      payload: '{"__proto__": {"admin": true}}',
    });
    expect(res.statusCode).toBe(400);
    // Rejected at the content-type-parser layer (secure-json-parse fires,
    // Fastify wraps it as an FST_ERR_CTP_* invalid-JSON error). Had the
    // payload been accepted, it would have reached zod and come back as
    // InvalidArg instead.
    expect(res.json().error.code).toMatch(/^FST_ERR_CTP_/);
  });
});
