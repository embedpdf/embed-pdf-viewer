/**
 * A signing across replicas: prepared on one server, completed on another
 * that shares only the database and the object store (no realtime bus
 * between them). The durable tail is what makes that possible; the
 * fences are what keep two replicas from publishing twice.
 */
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { buildDetachedCms, createTestSigner, profileFor } from '@embedpdf/core-signature';
import type { SignatureSubFilter } from '@embedpdf/engine-core/runtime';
import { decodePrepared, SignaturePreparedWireSchema, toBase64 } from '@embedpdf/engine-core/wire';
import {
  createSqliteDb,
  FsObjectStore,
  migrate,
  signDevToken,
  sqliteMigrations,
  StorageKeys,
  type AppBundle,
  type DbSchema,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'packages', 'engine', 'main', 'test', 'fixtures', 'unsigned_sigfield.pdf');
const SECRET = 'signatures-replicas-secret';
const TENANT = 'tenant-sign-replicas';
const DOC = 'doc-sign-replicas';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

interface Replica {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
}

let dir: string;
let storageRoot: string;
let a: Replica;
let b: Replica;
let seeded: { sha: string; size: number };

async function addReplica(name: string): Promise<Replica> {
  const db = createSqliteDb({ path: join(dir, 'shared.db') });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: new URL('../dist/runtime/worker-entry.js', import.meta.url),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot: join(dir, `cache-${name}`),
    cacheMaxBytes: 4 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  return { bundle, db, baseUrl: typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}` };
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sign-replicas-'));
  storageRoot = join(dir, 'objects');
  const bootstrap = createSqliteDb({ path: join(dir, 'shared.db') });
  await migrate(bootstrap, { source: { kind: 'inline', migrations: sqliteMigrations } });
  await bootstrap.destroy();
  a = await addReplica('a');
  b = await addReplica('b');
  const bytes = new Uint8Array(await readFile(fixturePath));
  seeded = { sha: sha256(bytes), size: bytes.byteLength };
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, { contentLength: bytes.byteLength });
  await a.db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await a.db
    .insertInto('documents')
    .values({ id: DOC, tenant_id: TENANT, state: 'ready', base_sha: seeded.sha, storage_size_bytes: bytes.byteLength, metadata_json: null, idempotency_key: null, failure_reason: null, created_at: now, updated_at: now, created_by: null })
    .execute();
});

afterAll(async () => {
  await a?.bundle.shutdown();
  await b?.bundle.shutdown();
  await a?.db.destroy();
  await b?.db.destroy();
  await rm(dir, { recursive: true, force: true });
});

const token = (layer: string) => signDevToken(SECRET, { sub: `user-${layer}`, tenant_id: TENANT, doc_id: DOC, layer_name: layer, scope: ['*'] });

async function call(replica: Replica, method: string, path: string, layer: string, body?: BodyInit, contentType?: string): Promise<Response> {
  return fetch(`${replica.baseUrl}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token(layer)}`, ...(contentType ? { 'Content-Type': contentType } : {}) },
    ...(body !== undefined ? { body } : {}),
  });
}
const json = async <T,>(res: Response, status = 200): Promise<T> => {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
};
const prepareForm = (body: unknown) => {
  const form = new FormData();
  form.append('body', JSON.stringify(body));
  return form;
};
const layer = `/v1/docs/${DOC}/layers/alice`;

describe('signing across replicas', () => {
  test('prepared on A, completed on B; A follows the published version on its next read', async () => {
    const signer = await createTestSigner({ commonName: 'Replica Signer' });
    // A holds the layer session and edits it.
    await json(await call(a, 'POST', `${layer}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, 'alice',
      JSON.stringify({ value: { type: 'text', value: 'from A' } }), 'application/json'));
    const prepared = decodePrepared(SignaturePreparedWireSchema.parse(await json(
      await call(a, 'POST', `${layer}/signatures/prepare`, 'alice', prepareForm({ field: { kind: 'fqn', name: 'sig' }, certify: { permission: 2 } })),
    )));
    expect(prepared.expectedVersion).toEqual({ baseSha256: seeded.sha, editsVersion: 2 });
    // The tail is durable: B can see it without ever having opened the document.
    expect(await new FsObjectStore({ root: storageRoot }).exists(StorageKeys.signingTail(TENANT, DOC, prepared.signingId))).toBe(true);
    // B refuses writes on the layer too (the row is the guard, not the session).
    const blocked = await call(b, 'POST', `${layer}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, 'alice',
      JSON.stringify({ value: { type: 'text', value: 'from B' } }), 'application/json');
    expect(blocked.status).toBe(409);

    const cms = await buildDetachedCms({ digest: prepared.digest, hash: prepared.algorithm, profile: profileFor(prepared.subFilter as SignatureSubFilter), signer });
    // Both replicas race to complete with the same CMS: exactly one publishes, the other replays.
    const [ra, rb] = await Promise.all([
      call(a, 'POST', `${layer}/signatures/${prepared.signingId}/complete`, 'alice', JSON.stringify({ cms: toBase64(cms), expectedVersion: prepared.expectedVersion }), 'application/json'),
      call(b, 'POST', `${layer}/signatures/${prepared.signingId}/complete`, 'alice', JSON.stringify({ cms: toBase64(cms), expectedVersion: prepared.expectedVersion }), 'application/json'),
    ]);
    const results = await Promise.all([ra, rb].map((r) => json<{ status: string; version: { sha256: string; byteLength: number } }>(r)));
    expect(results.map((r) => r.status).sort()).toEqual(['already-completed', 'completed']);
    expect(results[0]!.version).toEqual(results[1]!.version);
    const version = results[0]!.version;
    const rows = await a.db.selectFrom('base_versions').select(['number', 'sha256']).where('doc_id', '=', DOC).orderBy('number').execute();
    expect(rows.map((r) => [Number(r.number), r.sha256])).toEqual([[1, seeded.sha], [2, version.sha256]]);
    expect(await new FsObjectStore({ root: storageRoot }).exists(StorageKeys.signingTail(TENANT, DOC, prepared.signingId))).toBe(true);

    // Whoever lost the race (and never heard a bus signal) still answers from
    // the published version: the manifest is durable truth, and its layer
    // session is reloaded because the layer's version moved.
    const winner = results[0]!.status === 'completed' ? 'a' : 'b';
    for (const [name, replica] of [['a', a], ['b', b]] as const) {
      const manifest = await json<{ baseSha: string; working: boolean; layerVersion: number }>(await call(replica, 'GET', `${layer}/manifest`, 'alice'));
      expect(manifest).toMatchObject({ baseSha: version.sha256, working: false, layerVersion: 3 });
      const snapshot = await json<{ signatures: Array<{ fieldName: string; signed: boolean; coverage: string | null }> }>(await call(replica, 'GET', `${layer}/signatures`, 'alice'));
      expect(snapshot.signatures, `replica ${name} (winner ${winner})`).toEqual([expect.objectContaining({ fieldName: 'sig', signed: true, coverage: 'whole-revision' })]);
      const form = await json<{ fields: Array<{ name: string; value: unknown }> }>(await call(replica, 'GET', `${layer}/form`, 'alice'));
      expect(JSON.stringify(form.fields.find((f) => f.name === 'group.total')?.value)).toContain('from A');
      const download = await call(replica, 'GET', `/v1/docs/${DOC}/versions/download/${version.sha256}`, 'alice');
      expect(sha256(new Uint8Array(await download.arrayBuffer()))).toBe(version.sha256);
    }

    // A new signing on the published version works from either replica; a
    // fence recorded by A is checked by B.
    const second = await json<{ signatures: Array<{ fieldName: string; signed: boolean }> }>(await call(b, 'GET', `${layer}/signatures`, 'alice'));
    expect(second.signatures.every((s) => s.signed)).toBe(true);
    const refused = await call(b, 'POST', `${layer}/signatures/prepare`, 'alice', prepareForm({ field: { kind: 'fqn', name: 'sig' } }));
    expect(refused.status).toBe(422);
  });
});
