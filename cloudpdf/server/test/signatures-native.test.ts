/**
 * Digital signatures over HTTP against the real fork (native runtime),
 * in whichever engine isolation the matrix selects (inline worker threads
 * or the supervised host process: CLOUDPDF_TEST_ISOLATION=host). The
 * engine-client suite covers the SDK surface; this one pins the wire:
 * the multipart prepare envelope, the JSON completion, the version
 * catalog and its immutable reads, the pending guard, and the replay.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { buildDetachedCms, createTestSigner, profileFor } from '@embedpdf/core-signature';
import type { SignatureSubFilter } from '@embedpdf/engine-core/runtime';
import { SIGNATURE_POLICY_VERSION } from '@embedpdf/engine-core/runtime';
import { decodePrepared, encodeAnalysisToken, SignaturePreparedWireSchema, toBase64 } from '@embedpdf/engine-core/wire';
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
const fixturePath = resolve(
  here,
  '..',
  '..',
  '..',
  'packages',
  'engine',
  'main',
  'test',
  'fixtures',
  'unsigned_sigfield.pdf',
);
const SECRET = 'signatures-native-secret';
const TENANT = 'tenant-sign-native';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

interface Fixture {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
}

let fx: Fixture;

beforeAll(async () => {
  const storageRoot = await mkdtemp(join(tmpdir(), 'sign-native-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'sign-native-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    // The BUILT worker entry: worker threads (and the host process) load
    // plain ESM, and the native runtime lives behind it.
    workerEntry: new URL('../dist/runtime/worker-entry.js', import.meta.url),
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 4 * 1024 * 1024,
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  fx = {
    bundle,
    db,
    baseUrl: typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`,
    storageRoot,
    cacheRoot,
  };
});

afterAll(async () => {
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
});

async function seed(docId: string): Promise<{ sha: string; size: number }> {
  const bytes = new Uint8Array(await readFile(fixturePath));
  const sha = sha256(bytes);
  await new FsObjectStore({ root: fx.storageRoot }).put(StorageKeys.basePdf(TENANT, docId), bytes, {
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
  return { sha, size: bytes.byteLength };
}

const token = (docId: string, layer: string) =>
  signDevToken(SECRET, { sub: `user-${layer}`, tenant_id: TENANT, doc_id: docId, layer_name: layer, scope: ['*'] });

async function call(
  method: string,
  path: string,
  docId: string,
  layer: string,
  body?: BodyInit,
  contentType?: string,
): Promise<Response> {
  return fetch(`${fx.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(docId, layer)}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });
}

const json = async <T,>(res: Response, status = 200): Promise<T> => {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
};

function prepareForm(body: unknown): FormData {
  const form = new FormData();
  form.append('body', JSON.stringify(body));
  return form;
}

describe('digital signatures over the wire (native runtime)', () => {
  test('prepare (multipart) → complete (JSON) publishes a version; the catalog and immutable reads follow', async () => {
    const docId = 'doc-sign-native-1';
    const seeded = await seed(docId);
    const layer = `/v1/docs/${docId}/layers/alice`;
    const signer = await createTestSigner({ commonName: 'Wire Signer' });

    // A fill first: the edit and the signature share one revision.
    await json(
      await call('POST', `${layer}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, docId, 'alice',
        JSON.stringify({ value: { type: 'text', value: 'wire' } }), 'application/json'),
    );
    const before = await json<{ signatures: Array<{ fieldName: string; signed: boolean }>; revisions: unknown[] }>(
      await call('GET', `${layer}/signatures`, docId, 'alice'),
    );
    expect(before.signatures).toEqual([expect.objectContaining({ fieldName: 'sig', signed: false })]);

    const preparedRes = await call('POST', `${layer}/signatures/prepare`, docId, 'alice',
      prepareForm({ field: { kind: 'fqn', name: 'sig' }, certify: { permission: 2 }, signer: { name: 'Wire' } }));
    expect(preparedRes.headers.get('cache-control')).toContain('no-store');
    const preparedWire = SignaturePreparedWireSchema.parse(await json(preparedRes));
    const prepared = decodePrepared(preparedWire);
    expect(prepared.expectedVersion).toEqual({ baseSha256: seeded.sha, editsVersion: 2 });
    expect(prepared.digest.byteLength).toBe(32);

    // Pending: the layer refuses writes with a conflict.
    const blocked = await call('POST', `${layer}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, docId, 'alice',
      JSON.stringify({ value: { type: 'text', value: 'nope' } }), 'application/json');
    expect(blocked.status).toBe(409);
    expect((await blocked.json() as { error: { code: string } }).error.code).toBe('SigningPending');
    // The manifest already says so.
    const pendingManifest = await json<{ layerVersion: number; working: boolean; docVersion: number }>(
      await call('GET', `${layer}/manifest`, docId, 'alice'),
    );
    expect(pendingManifest).toMatchObject({ layerVersion: 2, working: true });

    const cms = await buildDetachedCms({
      digest: prepared.digest,
      hash: prepared.algorithm,
      profile: profileFor(prepared.subFilter as SignatureSubFilter),
      signer,
    });
    // A stale fence is refused before any byte is touched.
    const stale = await call('POST', `${layer}/signatures/${prepared.signingId}/complete`, docId, 'alice',
      JSON.stringify({ cms: toBase64(cms), expectedVersion: { ...prepared.expectedVersion, editsVersion: 99 } }),
      'application/json');
    expect(stale.status).toBe(409);
    const completed = await json<{
      status: string;
      version: { sha256: string; byteLength: number };
      signature: { signed: boolean; coverage: string; docMdp: number; revisionIndex: number };
      meta: { cacheDelta: null; affectedPages: unknown[] };
    }>(
      await call('POST', `${layer}/signatures/${prepared.signingId}/complete`, docId, 'alice',
        JSON.stringify({ cms: toBase64(cms), expectedVersion: prepared.expectedVersion }), 'application/json'),
    );
    expect(completed.status).toBe('completed');
    expect(completed.signature).toMatchObject({ signed: true, coverage: 'whole-revision', docMdp: 2, revisionIndex: 1 });
    expect(completed.meta.cacheDelta).toBeNull();
    expect(completed.meta.affectedPages.length).toBeGreaterThan(0);

    // The catalog and the head.
    const versions = await json<{ head: string; versions: Array<{ number: number; sha256: string; parentSha256: string | null; producer: string; signingId: string | null }> }>(
      await call('GET', `/v1/docs/${docId}/versions`, docId, 'alice'),
    );
    expect(versions.head).toBe(completed.version.sha256);
    expect(versions.versions).toEqual([
      expect.objectContaining({ number: 1, sha256: seeded.sha, parentSha256: null, producer: 'upload' }),
      expect.objectContaining({ number: 2, sha256: completed.version.sha256, parentSha256: seeded.sha, producer: 'signature', signingId: prepared.signingId }),
    ]);
    const head = await json<{ baseSha: string; docVersion: number }>(await call('GET', `/v1/docs/${docId}/head`, docId, 'alice'));
    expect(head.baseSha).toBe(completed.version.sha256);

    // Immutable version reads: snapshot, contents, digest, download, revision prefix.
    const vsig = await call('GET', `/v1/docs/${docId}/versions/signatures/${completed.version.sha256}`, docId, 'alice');
    expect(vsig.headers.get('cache-control')).toContain('immutable');
    const vsnap = await json<{ revisions: Array<{ end: number }>; signatures: Array<{ fieldName: string; contentsSize: number }> }>(vsig);
    expect(vsnap.revisions).toHaveLength(2);
    const contents = await call('GET', `/v1/docs/${docId}/versions/signatures/${completed.version.sha256}/${encodeFieldKey('sig')}/contents`, docId, 'alice');
    expect(contents.status).toBe(200);
    expect(contents.headers.get('content-type')).toContain('application/pkcs7-signature');
    expect(new Uint8Array(await contents.arrayBuffer())).toEqual(cms);
    const digest = await call('GET', `/v1/docs/${docId}/versions/signatures/${completed.version.sha256}/${encodeFieldKey('sig')}/digest/sha256`, docId, 'alice');
    expect(new Uint8Array(await digest.arrayBuffer())).toEqual(prepared.digest);
    const download = await call('GET', `/v1/docs/${docId}/versions/download/${completed.version.sha256}`, docId, 'alice');
    const published = new Uint8Array(await download.arrayBuffer());
    expect(published.byteLength).toBe(completed.version.byteLength);
    expect(sha256(published)).toBe(completed.version.sha256);
    const rev0 = await call('GET', `/v1/docs/${docId}/versions/revisions/${completed.version.sha256}/0`, docId, 'alice');
    const rev0Bytes = new Uint8Array(await rev0.arrayBuffer());
    expect(rev0Bytes.byteLength).toBe(seeded.size);
    expect(sha256(rev0Bytes)).toBe(seeded.sha);
    expect((await call('GET', `/v1/docs/${docId}/versions/revisions/${completed.version.sha256}/7`, docId, 'alice')).status).toBe(404);
    expect((await call('GET', `/v1/docs/${docId}/versions/download/${'0'.repeat(64)}`, docId, 'alice')).status).toBe(404);

    // The layer is clean over the new version; the fill survived in the published bytes.
    const manifest = await json<{ baseSha: string; baseByteLength: number; layerVersion: number; working: boolean; scopes: Record<string, string> }>(
      await call('GET', `${layer}/manifest`, docId, 'alice'),
    );
    expect(manifest).toMatchObject({ baseSha: completed.version.sha256, baseByteLength: completed.version.byteLength, layerVersion: 3, working: false });
    expect(new Set(Object.values(manifest.scopes))).toEqual(new Set(['base']));
    const form = await json<{ fields: Array<{ name: string; value: unknown }> }>(await call('GET', `${layer}/form`, docId, 'alice'));
    expect(JSON.stringify(form.fields.find((f) => f.name === 'group.total')?.value)).toContain('wire');

    // Replay with the same CMS: already-completed; a different CMS: refused; abort: already-completed.
    const replay = await json<{ status: string; version: { sha256: string } }>(
      await call('POST', `${layer}/signatures/${prepared.signingId}/complete`, docId, 'alice',
        JSON.stringify({ cms: toBase64(cms), expectedVersion: prepared.expectedVersion }), 'application/json'),
    );
    expect(replay).toMatchObject({ status: 'already-completed', version: { sha256: completed.version.sha256 } });
    const other = await call('POST', `${layer}/signatures/${prepared.signingId}/complete`, docId, 'alice',
      JSON.stringify({ cms: toBase64(new Uint8Array([0x30, 3, 2, 1, 1])), expectedVersion: prepared.expectedVersion }), 'application/json');
    expect(other.status).toBe(422);
    expect(await json<{ status: string }>(await call('DELETE', `${layer}/signatures/${prepared.signingId}`, docId, 'alice'))).toEqual({ status: 'already-completed' });

    // The audit trail carries the completion; a subscriber refetches.
    const audit = await fx.db.selectFrom('audit_log').select(['kind', 'artifact_sha']).where('doc_id', '=', docId).orderBy('id', 'desc').limit(1).executeTakeFirst();
    expect(audit).toMatchObject({ kind: 'signature.completed', artifact_sha: completed.version.sha256 });
  });

  test('analysis URLs: the policy version is a served cache key, and only settled verdicts are immutable', async () => {
    const docId = 'doc-sign-native-analysis';
    await seed(docId);
    const layer = `/v1/docs/${docId}/layers/alice`;
    const signer = await createTestSigner({ commonName: 'Analysis Signer' });
    const prepared = decodePrepared(SignaturePreparedWireSchema.parse(await json(
      await call('POST', `${layer}/signatures/prepare`, docId, 'alice', prepareForm({ field: { kind: 'fqn', name: 'sig' } })),
    )));
    const cms = await buildDetachedCms({ digest: prepared.digest, hash: prepared.algorithm, profile: profileFor(prepared.subFilter as SignatureSubFilter), signer });
    const completed = await json<{ version: { sha256: string } }>(
      await call('POST', `${layer}/signatures/${prepared.signingId}/complete`, docId, 'alice',
        JSON.stringify({ cms: toBase64(cms), expectedVersion: prepared.expectedVersion }), 'application/json'),
    );
    const sha = completed.version.sha256;
    const versionUrl = (q: string) => `/v1/docs/${docId}/versions/analysis/${sha}?${q}`;

    // The current policy: a settled verdict, cached for a year.
    const ok = await call('GET', versionUrl(`since.signature=0&policy=${SIGNATURE_POLICY_VERSION}`), docId, 'alice');
    expect(ok.headers.get('cache-control')).toContain('immutable');
    const analysis = await json<{ policyVersion: number; mode: string; verdict: string }>(ok);
    expect(analysis).toMatchObject({ policyVersion: SIGNATURE_POLICY_VERSION, mode: 'authoritative', verdict: 'unchanged' });
    // No policy at all (an older client): served, since it asked for nothing in particular.
    expect((await call('GET', versionUrl('since.signature=0'), docId, 'alice')).status).toBe(200);
    // Another policy: refused, and never cached under that key.
    const stale = await call('GET', versionUrl(`since.signature=0&policy=${SIGNATURE_POLICY_VERSION + 1}`), docId, 'alice');
    expect(stale.status).toBe(400);
    expect(stale.headers.get('cache-control')).toContain('no-store');
    expect(stale.headers.get('cache-control')).not.toContain('immutable');
    // Exploratory: an answer to a what-if, not a verdict; never immutable.
    const exploratory = await call('GET', versionUrl(`since.signature=0&level=fill&policy=${SIGNATURE_POLICY_VERSION}`), docId, 'alice');
    expect((await json<{ mode: string }>(exploratory)).mode).toBe('exploratory');
    expect(exploratory.headers.get('cache-control')).toContain('no-store');

    // The layer twin: the token carries the policy.
    const manifest = await json<{ docVersion: number }>(await call('GET', `${layer}/manifest`, docId, 'alice'));
    const tokenFor = (policyVersion: number) => encodeAnalysisToken({ docVersion: manifest.docVersion, since: { signatureIndex: 0 }, policyVersion });
    const layerOk = await call('GET', `${layer}/signatures/analysis@${tokenFor(SIGNATURE_POLICY_VERSION)}`, docId, 'alice');
    expect(layerOk.headers.get('cache-control')).toContain('immutable');
    expect((await json<{ policyVersion: number }>(layerOk)).policyVersion).toBe(SIGNATURE_POLICY_VERSION);
    const layerStale = await call('GET', `${layer}/signatures/analysis@${tokenFor(SIGNATURE_POLICY_VERSION + 1)}`, docId, 'alice');
    expect(layerStale.status).toBe(400);
    expect(layerStale.headers.get('cache-control')).toContain('no-store');
  });

  test('abort frees the layer; expiry is swept; a sibling behind the head cannot sign', async () => {
    const docId = 'doc-sign-native-2';
    await seed(docId);
    const alice = `/v1/docs/${docId}/layers/alice`;
    const bob = `/v1/docs/${docId}/layers/bob`;

    // Bob edits first: his layer is over version 1.
    await json(await call('POST', `${bob}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, docId, 'bob',
      JSON.stringify({ value: { type: 'text', value: 'bob' } }), 'application/json'));

    const p1 = decodePrepared(SignaturePreparedWireSchema.parse(await json(
      await call('POST', `${alice}/signatures/prepare`, docId, 'alice', prepareForm({ field: { kind: 'fqn', name: 'sig' } })),
    )));
    expect(await json<{ status: string }>(await call('DELETE', `${alice}/signatures/${p1.signingId}`, docId, 'alice'))).toEqual({ status: 'aborted' });
    expect(await json<{ status: string }>(await call('DELETE', `${alice}/signatures/${p1.signingId}`, docId, 'alice'))).toEqual({ status: 'unknown' });
    expect((await call('POST', `${alice}/signatures/${p1.signingId}/complete`, docId, 'alice',
      JSON.stringify({ cms: toBase64(new Uint8Array([0x30, 3, 2, 1, 1])), expectedVersion: p1.expectedVersion }), 'application/json')).status).toBe(410);
    // The tail is gone with the row.
    expect(await new FsObjectStore({ root: fx.storageRoot }).exists(StorageKeys.signingTail(TENANT, docId, p1.signingId))).toBe(false);

    // Expiry: a prepared signing past its deadline is swept and the layer writable.
    const p2 = decodePrepared(SignaturePreparedWireSchema.parse(await json(
      await call('POST', `${alice}/signatures/prepare`, docId, 'alice', prepareForm({ field: { kind: 'fqn', name: 'sig' } })),
    )));
    await fx.db.updateTable('document_signings').set({ expires_at: Date.now() - 1 }).where('id', '=', p2.signingId).execute();
    expect(await fx.bundle.layerService!.expireSignings(Date.now())).toBe(1);
    expect((await fx.db.selectFrom('document_signings').select('state').where('id', '=', p2.signingId).executeTakeFirst())?.state).toBe('expired');
    await json(await call('POST', `${alice}/form/fields/${encodeURIComponent('fqn:group.total')}/value`, docId, 'alice',
      JSON.stringify({ value: { type: 'text', value: 'after expiry' } }), 'application/json'));

    // Sign for real on alice; bob is then behind the head.
    const signer = await createTestSigner();
    const p3 = decodePrepared(SignaturePreparedWireSchema.parse(await json(
      await call('POST', `${alice}/signatures/prepare`, docId, 'alice', prepareForm({ field: { kind: 'fqn', name: 'sig' } })),
    )));
    const cms = await buildDetachedCms({ digest: p3.digest, hash: p3.algorithm, profile: profileFor(p3.subFilter as SignatureSubFilter), signer });
    const done = await json<{ status: string; version: { sha256: string } }>(await call('POST', `${alice}/signatures/${p3.signingId}/complete`, docId, 'alice',
      JSON.stringify({ cms: toBase64(cms), expectedVersion: p3.expectedVersion }), 'application/json'));
    expect(done.status).toBe('completed');

    const bobManifest = await json<{ baseSha: string; scopes: Record<string, string> }>(await call('GET', `${bob}/manifest`, docId, 'bob'));
    expect(bobManifest.baseSha).not.toBe(done.version.sha256);
    expect(new Set(Object.values(bobManifest.scopes))).toEqual(new Set(['layer', 'base']));
    expect(bobManifest.scopes).toMatchObject({ content: 'layer', metadata: 'layer', attachments: 'layer', actions: 'base' });
    const staleBob = await call('POST', `${bob}/signatures/prepare`, docId, 'bob', prepareForm({ field: { kind: 'fqn', name: 'sig' } }));
    expect(staleBob.status).toBe(409);
    expect((await staleBob.json() as { error: { code: string } }).error.code).toBe('StaleBase');
    // Bob's own reads still work over his version.
    const bobForm = await json<{ fields: Array<{ name: string; value: unknown }> }>(await call('GET', `${bob}/form`, docId, 'bob'));
    expect(JSON.stringify(bobForm.fields.find((f) => f.name === 'group.total')?.value)).toContain('bob');

    // A fresh layer after the publish inherits everything over version 2.
    const carol = await json<{ baseSha: string; scopes: Record<string, string>; docVersion: number }>(
      await call('GET', `/v1/docs/${docId}/layers/carol/manifest`, docId, 'carol'),
    );
    expect(carol.baseSha).toBe(done.version.sha256);
    expect(new Set(Object.values(carol.scopes))).toEqual(new Set(['base']));
  });
});

/** Token-text (the attachment key encoding): base64 with `-` and `.`, unpadded. */
function encodeFieldKey(name: string): string {
  return Buffer.from(name, 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '.').replace(/=+$/, '');
}
