/** Deterministic loser: B publishes first, then A (which prepared and holds the layer session) replays and reads. */
import { createHash } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { buildDetachedCms, createTestSigner, profileFor } from '@embedpdf/core-signature';
import type { SignatureSubFilter } from '@embedpdf/engine-core/runtime';
import { decodePrepared, SignaturePreparedWireSchema, toBase64 } from '@embedpdf/engine-core/wire';
import { createSqliteDb, FsObjectStore, migrate, signDevToken, sqliteMigrations, StorageKeys, type AppBundle, type DbSchema } from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

const here = dirname(fileURLToPath(import.meta.url));
const fixturePath = resolve(here, '..', '..', '..', 'packages', 'engine', 'main', 'test', 'fixtures', 'unsigned_sigfield.pdf');
const SECRET = 'signatures-replicas-order-secret';
const TENANT = 'tenant-sign-order';
const DOC = 'doc-sign-order';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
interface Replica { bundle: AppBundle; db: Kysely<DbSchema>; baseUrl: string }
let dir: string; let storageRoot: string; let a: Replica; let b: Replica;

async function addReplica(name: string): Promise<Replica> {
  const db = createSqliteDb({ path: join(dir, 'shared.db') });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(), verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: new URL('../dist/runtime/worker-entry.js', import.meta.url), poolSize: 1, db,
    objectStore: new FsObjectStore({ root: storageRoot }), autoProvisionTenant: true, sweepIntervalMs: 0,
    cacheRoot: join(dir, `cache-${name}`), cacheMaxBytes: 4 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  return { bundle, db, baseUrl: typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}` };
}
beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'sign-order-')); storageRoot = join(dir, 'objects');
  const bootstrap = createSqliteDb({ path: join(dir, 'shared.db') });
  await migrate(bootstrap, { source: { kind: 'inline', migrations: sqliteMigrations } }); await bootstrap.destroy();
  a = await addReplica('a'); b = await addReplica('b');
  const bytes = new Uint8Array(await readFile(fixturePath));
  await new FsObjectStore({ root: storageRoot }).put(StorageKeys.basePdf(TENANT, DOC), bytes, { contentLength: bytes.byteLength });
  await a.db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
  const now = Date.now();
  await a.db.insertInto('documents').values({ id: DOC, tenant_id: TENANT, state: 'ready', base_sha: sha256(bytes), storage_size_bytes: bytes.byteLength, metadata_json: null, idempotency_key: null, failure_reason: null, created_at: now, updated_at: now, created_by: null }).execute();
});
afterAll(async () => { await a?.bundle.shutdown(); await b?.bundle.shutdown(); await a?.db.destroy(); await b?.db.destroy(); await rm(dir, { recursive: true, force: true }); });
const token = (layer: string) => signDevToken(SECRET, { sub: `user-${layer}`, tenant_id: TENANT, doc_id: DOC, layer_name: layer, scope: ['*'] });
const call = (r: Replica, method: string, path: string, layer: string, body?: BodyInit, ct?: string) =>
  fetch(`${r.baseUrl}${path}`, { method, headers: { Authorization: `Bearer ${token(layer)}`, ...(ct ? { 'Content-Type': ct } : {}) }, ...(body !== undefined ? { body } : {}) });
const json = async <T,>(res: Response): Promise<T> => { const t = await res.text(); expect(res.status, t).toBe(200); return JSON.parse(t) as T; };
const layer = `/v1/docs/${DOC}/layers/alice`;

test('B publishes first; A (the preparer) replays and then reads the published version', async () => {
  const signer = await createTestSigner();
  await json(await call(a, 'POST', `${layer}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, 'alice', JSON.stringify({ value: { type: 'text', value: 'from A' } }), 'application/json'));
  const form = new FormData(); form.append('body', JSON.stringify({ field: { kind: 'fqn', name: 'sig' } }));
  const prepared = decodePrepared(SignaturePreparedWireSchema.parse(await json(await call(a, 'POST', `${layer}/signatures/prepare`, 'alice', form))));
  const cms = await buildDetachedCms({ digest: prepared.digest, hash: prepared.algorithm, profile: profileFor(prepared.subFilter as SignatureSubFilter), signer });
  const body = JSON.stringify({ cms: toBase64(cms), expectedVersion: prepared.expectedVersion });
  const first = await json<{ status: string; version: { sha256: string } }>(await call(b, 'POST', `${layer}/signatures/${prepared.signingId}/complete`, 'alice', body, 'application/json'));
  expect(first.status).toBe('completed');
  const second = await json<{ status: string }>(await call(a, 'POST', `${layer}/signatures/${prepared.signingId}/complete`, 'alice', body, 'application/json'));
  expect(second.status).toBe('already-completed');
  for (const [name, r] of [['a', a], ['b', b]] as const) {
    const manifest = await json<{ baseSha: string; layerVersion: number; working: boolean }>(await call(r, 'GET', `${layer}/manifest`, 'alice'));
    expect(manifest, name).toMatchObject({ baseSha: first.version.sha256, layerVersion: 3, working: false });
    const snapshot = await json<{ signatures: Array<{ signed: boolean }> }>(await call(r, 'GET', `${layer}/signatures`, 'alice'));
    expect(snapshot.signatures.map((s) => s.signed), name).toEqual([true]);
  }
});
