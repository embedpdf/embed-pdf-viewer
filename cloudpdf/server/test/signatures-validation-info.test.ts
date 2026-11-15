/**
 * Validation data over HTTP against the real fork (native runtime): the
 * write with a route of its own and its audit row, the cached read pinned at
 * the document version, what the server refuses, and a document timestamp
 * prepared with no field.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import type { Kysely } from 'kysely';
import { createTestSigner, createTestTimestampAuthority } from '@embedpdf/core-signature';
import {
  decodePrepared,
  SignaturePreparedWireSchema,
  toBase64,
  wirePaths,
} from '@embedpdf/engine-core/wire';
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
import { pinOf } from './_helpers/pins';

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
const SECRET = 'signatures-validation-info-secret';
const TENANT = 'tenant-sign-validation-info';
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
  const storageRoot = await mkdtemp(join(tmpdir(), 'sign-info-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'sign-info-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    // The built worker entry: worker threads (and the host process) load
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

const token = (docId: string, layer: string, scope: string[] = ['*']) =>
  signDevToken(SECRET, {
    sub: `user-${layer}`,
    tenant_id: TENANT,
    doc_id: docId,
    layer_name: layer,
    scope,
  });

async function call(
  method: string,
  path: string,
  docId: string,
  layer: string,
  body?: BodyInit,
  contentType?: string,
  scope?: string[],
): Promise<Response> {
  return fetch(`${fx.baseUrl}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token(docId, layer, scope)}`,
      ...(contentType ? { 'Content-Type': contentType } : {}),
    },
    ...(body !== undefined ? { body } : {}),
  });
}

const json = async <T>(res: Response, status = 200): Promise<T> => {
  const text = await res.text();
  expect(res.status, text).toBe(status);
  return JSON.parse(text) as T;
};

function prepareForm(body: unknown): FormData {
  const form = new FormData();
  form.append('body', JSON.stringify(body));
  return form;
}

interface Counts {
  certificates: number;
  ocspResponses: number;
  crls: number;
}
interface Stored {
  certificates: string[];
  ocspResponses: string[];
  crls: string[];
}
const NONE: Counts = { certificates: 0, ocspResponses: 0, crls: 0 };
const READ_ONLY = ['doc.open', 'doc.forms.read'];
const GROUP_SIGNER = ['doc.open', 'doc.forms.read', 'fields:sign:group=buyer'];

describe('validation data over the wire (native runtime)', () => {
  const info = (docId: string, layer = 'alice') =>
    `/v1/docs/${docId}/layers/${layer}/signatures/validation-info`;
  const docVersionOf = async (docId: string, layer = 'alice'): Promise<number> =>
    (
      await json<{ docVersion: number }>(
        await call('GET', `/v1/docs/${docId}/layers/${layer}/manifest`, docId, layer),
      )
    ).docVersion;
  const store = (docId: string, body: unknown, layer = 'alice', scope?: string[]) =>
    call('POST', info(docId, layer), docId, layer, JSON.stringify(body), 'application/json', scope);
  /** Two DER objects to store: certificates, which is all the server checks an entry to be. */
  const twoEntries = async () => {
    const first = toBase64((await createTestSigner({ commonName: 'One' })).certificate);
    const second = toBase64((await createTestSigner({ commonName: 'Two' })).certificate);
    return { first, second };
  };

  test('stores entries once, at a new document version, and reads them back', async () => {
    const docId = 'doc-info-store';
    await seed(docId);
    const { first, second } = await twoEntries();
    expect(await json<Stored>(await call('GET', info(docId), docId, 'alice'))).toEqual({
      certificates: [],
      ocspResponses: [],
      crls: [],
    });
    const before = await docVersionOf(docId);

    const stored = await json<{ added: Counts; meta: { cacheDelta?: unknown } }>(
      await store(docId, { certificates: [first], ocspResponses: [second] }),
    );
    expect(stored.added).toEqual({ certificates: 1, ocspResponses: 1, crls: 0 });
    expect(stored.meta.cacheDelta).toBeDefined();
    expect(await docVersionOf(docId)).toBe(before + 1);
    expect(await json<Stored>(await call('GET', info(docId), docId, 'alice'))).toEqual({
      certificates: [first],
      ocspResponses: [second],
      crls: [],
    });

    // What the file holds is not stored twice: nothing is written, and no version is made.
    const again = await json<{ added: Counts }>(
      await store(docId, { certificates: [first], crls: [] }),
    );
    expect(again.added).toEqual(NONE);
    expect(await docVersionOf(docId)).toBe(before + 1);
    // A new entry beside a known one: only the new one counts.
    const more = await json<{ added: Counts }>(
      await store(docId, { certificates: [first, second] }),
    );
    expect(more.added).toEqual({ certificates: 1, ocspResponses: 0, crls: 0 });
    expect(await docVersionOf(docId)).toBe(before + 2);
  });

  test('the read is cached at the document version it names, and only there', async () => {
    const docId = 'doc-info-cached';
    await seed(docId);
    const { first } = await twoEntries();
    const at = (docVersion: number) =>
      call(
        'GET',
        wirePaths.layerSignaturesValidationInfo(
          docId,
          'alice',
          docVersion,
          pinOf('validationInfo'),
        ),
        docId,
        'alice',
      );
    const before = await docVersionOf(docId);
    const empty = await at(before);
    expect(empty.headers.get('cache-control')).toContain('immutable');
    expect((await json<Stored>(empty)).certificates).toEqual([]);

    await json(await store(docId, { certificates: [first] }));
    // The version it was read at is gone, and that answer is never cached.
    const stale = await at(before);
    expect(stale.status).toBe(404);
    expect(stale.headers.get('cache-control')).toContain('no-store');
    const current = await at(before + 1);
    expect(current.headers.get('cache-control')).toContain('immutable');
    expect((await json<Stored>(current)).certificates).toEqual([first]);
    // The current form is live.
    const live = await call('GET', info(docId), docId, 'alice');
    expect(live.headers.get('cache-control')).toContain('no-store');
  });

  test('refuses an entry that is not one DER object, names it, and stores nothing', async () => {
    const docId = 'doc-info-refuse';
    await seed(docId);
    const { first } = await twoEntries();
    const before = await docVersionOf(docId);
    const pem = toBase64(new TextEncoder().encode('-----BEGIN CERTIFICATE-----'));

    const notDer = await json<{ error: { code: string; details?: { field?: string } } }>(
      await store(docId, { certificates: [first, pem] }),
      400,
    );
    expect(notDer.error).toMatchObject({
      code: 'InvalidArg',
      details: { field: 'certificates[1]' },
    });
    const notBase64 = await store(docId, { crls: ['not base64!'] });
    expect(notBase64.status).toBe(400);

    expect(await docVersionOf(docId)).toBe(before);
    expect(
      (await json<Stored>(await call('GET', info(docId), docId, 'alice'))).certificates,
    ).toEqual([]);
  });

  test('storing takes doc.sign, and reading takes doc.forms.read', async () => {
    const docId = 'doc-info-permissions';
    await seed(docId);
    const { first } = await twoEntries();
    for (const scope of [READ_ONLY, GROUP_SIGNER]) {
      const refused = await store(docId, { certificates: [first] }, 'alice', scope);
      expect(refused.status, scope.join(' ')).toBe(403);
      const read = await call('GET', info(docId), docId, 'alice', undefined, undefined, scope);
      expect(read.status, scope.join(' ')).toBe(200);
    }
    const noForms = await call('GET', info(docId), docId, 'alice', undefined, undefined, [
      'doc.open',
      'doc.sign',
    ]);
    expect(noForms.status).toBe(403);
  });

  test('the audit row says how many were stored, and never holds the entries', async () => {
    const docId = 'doc-info-audit';
    await seed(docId);
    const { first } = await twoEntries();
    await json(await store(docId, { certificates: [first] }));
    const [row] = await fx.db
      .selectFrom('audit_log')
      .select(['kind', 'payload_json'])
      .where('doc_id', '=', docId)
      .orderBy('id', 'desc')
      .limit(1)
      .execute();
    expect(row!.kind).toBe('signature.addValidationInfo');
    expect(JSON.parse(row!.payload_json)).toMatchObject({
      added: { certificates: 1, ocspResponses: 0, crls: 0 },
    });
    expect(row!.payload_json).not.toContain(first);
  });

  test('a document timestamp is prepared with no field, and the engine makes it', async () => {
    const docId = 'doc-info-timestamp';
    await seed(docId);
    const layer = `/v1/docs/${docId}/layers/alice`;
    const prepareForm = (body: unknown): FormData => {
      const form = new FormData();
      form.append('body', JSON.stringify(body));
      return form;
    };
    // Only a document timestamp may leave the field out.
    const noField = await call(
      'POST',
      `${layer}/signatures/prepare`,
      docId,
      'alice',
      prepareForm({}),
    );
    expect(noField.status).toBe(400);
    // It is the document's to sign, not a group's.
    const groupSigner = await call(
      'POST',
      `${layer}/signatures/prepare`,
      docId,
      'alice',
      prepareForm({ kind: 'timestamp' }),
      undefined,
      GROUP_SIGNER,
    );
    expect(groupSigner.status).toBe(403);

    const wire = await json<unknown>(
      await call(
        'POST',
        `${layer}/signatures/prepare`,
        docId,
        'alice',
        prepareForm({ kind: 'timestamp' }),
      ),
    );
    const prepared = decodePrepared(SignaturePreparedWireSchema.parse(wire));
    expect(prepared.field).toEqual({ kind: 'fqn', name: 'Timestamp1' });
    expect(prepared.subFilter).toBe('ETSI.RFC3161');

    const authority = await createTestTimestampAuthority();
    const tokenBytes = await authority.sign({
      digest: prepared.digest,
      algorithm: prepared.algorithm,
      subFilter: 'ETSI.RFC3161',
    });
    const completed = await json<{ signature: { fieldName: string; kind: string } }>(
      await call(
        'POST',
        `${layer}/signatures/${prepared.signingId}/complete`,
        docId,
        'alice',
        JSON.stringify({ cms: toBase64(tokenBytes), expectedVersion: prepared.expectedVersion }),
        'application/json',
      ),
    );
    expect(completed.signature).toMatchObject({ fieldName: 'Timestamp1', kind: 'timestamp' });

    const list = await json<{ signatures: { fieldName: string; signed: boolean }[] }>(
      await call('GET', `${layer}/signatures`, docId, 'alice'),
    );
    expect(list.signatures.map((entry) => [entry.fieldName, entry.signed])).toEqual([
      ['sig', false],
      ['Timestamp1', true],
    ]);
  });
});
