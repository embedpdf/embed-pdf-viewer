import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
  type AppBundle,
} from '../src/index';
import { buildAppForTesting } from '../src/app/buildApp';
import { createValidTestLicenseGate } from '../src/licensing/testing';

/**
 * WS3 Phase B — encode-in-engine.
 *
 * The stub worker implements the `*.renderEncoded` kinds with REAL sharp
 * (the same dependency the API-side `SharpImageEncoder` uses), so these
 * tests can assert the strongest property directly: the escape hatch
 * (`encodeInEngine: false` — raw rasters over the boundary + API-side
 * encode) produces BYTE-IDENTICAL responses to the default in-engine
 * path, for both the page-render route and the appearances multipart.
 */

const SECRET = 'encode-in-engine-secret';
const STUB_ENTRY = new URL('./_helpers/stub-worker-entry.cjs', import.meta.url);

interface Fx {
  bundle: AppBundle;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
  db: ReturnType<typeof createSqliteDb>;
}

const fixtures: Fx[] = [];

async function buildFx(encodeInEngine: boolean | undefined): Promise<Fx> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'encfx-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'encfx-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: new FsObjectStore({ root: storageRoot }),
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 64 * 1024 * 1024,
    ...(encodeInEngine !== undefined ? { encodeInEngine } : {}),
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  const fx = { bundle, baseUrl, storageRoot, cacheRoot, db };
  fixtures.push(fx);
  return fx;
}

/** Stub-format doc: byte 0 = page count; identical bytes in every fixture
 *  so both apps render the same raster. */
const DOC_BYTES = (() => {
  const bytes = new Uint8Array(4096);
  bytes[0] = 2;
  bytes.set(randomBytes(4095), 1);
  return bytes;
})();

async function seed(fx: Fx, tenantId: string, docId: string): Promise<string> {
  const sha = createHash('sha256').update(DOC_BYTES).digest('hex');
  await new FsObjectStore({ root: fx.storageRoot }).put(
    StorageKeys.basePdf(tenantId, docId),
    DOC_BYTES,
    { contentLength: DOC_BYTES.byteLength },
  );
  await fx.db
    .insertInto('tenants')
    .values({ id: tenantId, name: tenantId })
    .onConflict((oc) => oc.column('id').doNothing())
    .execute();
  const now = Date.now();
  await fx.db
    .insertInto('documents')
    .values({
      id: docId,
      tenant_id: tenantId,
      state: 'ready',
      base_sha: sha,
      storage_size_bytes: DOC_BYTES.byteLength,
      metadata_json: null,
      idempotency_key: null,
      failure_reason: null,
      created_at: now,
      updated_at: now,
      created_by: null,
    })
    .execute();
  return sha;
}

function token(tenantId: string, docId: string): string {
  return signDevToken(SECRET, {
    sub: 'user-1',
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: 'main',
    scope: ['*'],
  });
}

async function get(
  fx: Fx,
  tenantId: string,
  docId: string,
  path: string,
): Promise<{ status: number; contentType: string; headers: Headers; body: Uint8Array }> {
  const res = await fetch(`${fx.baseUrl}/v1/docs/${docId}${path}`, {
    headers: { Authorization: `Bearer ${token(tenantId, docId)}` },
  });
  return {
    status: res.status,
    contentType: res.headers.get('content-type') ?? '',
    headers: res.headers,
    body: new Uint8Array(await res.arrayBuffer()),
  };
}

const isWebp = (b: Uint8Array): boolean =>
  b.length > 12 &&
  b[0] === 0x52 && // R
  b[1] === 0x49 && // I
  b[2] === 0x46 && // F
  b[3] === 0x46 && // F
  b[8] === 0x57 && // W
  b[9] === 0x45 && // E
  b[10] === 0x42 && // B
  b[11] === 0x50; // P

const isPng = (b: Uint8Array): boolean =>
  b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;

afterAll(async () => {
  for (const fx of fixtures) {
    await fx.bundle.shutdown();
    await fx.db.destroy();
    await rm(fx.storageRoot, { recursive: true, force: true });
    await rm(fx.cacheRoot, { recursive: true, force: true });
  }
});

describe('encode-in-engine (WS3 Phase B)', () => {
  test('default path serves worker-encoded webp with dimension headers; png honored', async () => {
    const fx = await buildFx(undefined); // default = in-engine
    await seed(fx, 't1', 'docenc001');
    const res = await get(
      fx,
      't1',
      'docenc001',
      '/render/pages/1/data?viewport.kind=scale&viewport.scale=1',
    );
    expect(res.status).toBe(200);
    expect(res.contentType).toContain('image/webp');
    expect(isWebp(res.body)).toBe(true);
    // Advisory dimension headers survive the encoded path (they now come
    // from the wire image, not a local raster).
    expect(res.headers.get('x-embedpdf-image-width')).toBe('8');
    expect(res.headers.get('x-embedpdf-image-height')).toBe('8');

    const png = await get(
      fx,
      't1',
      'docenc001',
      '/render/pages/1/data?viewport.kind=scale&viewport.scale=1&format=png',
    );
    expect(png.status).toBe(200);
    expect(png.contentType).toContain('image/png');
    expect(isPng(png.body)).toBe(true);
  }, 30_000);

  test('escape hatch (encodeInEngine: false) is byte-identical: render route and appearances multipart', async () => {
    const inEngine = await buildFx(undefined);
    const legacy = await buildFx(false);
    await seed(inEngine, 't1', 'docenc002');
    await seed(legacy, 't1', 'docenc002');

    const renderPath = '/render/pages/1/data?viewport.kind=scale&viewport.scale=1';
    const a = await get(inEngine, 't1', 'docenc002', renderPath);
    const b = await get(legacy, 't1', 'docenc002', renderPath);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(Buffer.from(a.body).equals(Buffer.from(b.body))).toBe(true);

    // Appearances: same stub appearance, worker-encoded vs API-encoded —
    // manifests and image parts must match byte for byte.
    const appearancesPath = '/layers/main/annotations/pages/1/appearances?scale=1';
    const am = await get(inEngine, 't1', 'docenc002', appearancesPath);
    const bm = await get(legacy, 't1', 'docenc002', appearancesPath);
    expect(am.status).toBe(200);
    expect(bm.status).toBe(200);
    expect(am.headers.get('x-embedpdf-appearance-count')).toBe('1');
    expect(bm.headers.get('x-embedpdf-appearance-count')).toBe('1');
    // Multipart boundaries are deterministic per build; compare bodies
    // modulo the boundary token by stripping it.
    const norm = (body: Uint8Array, contentType: string): string => {
      const boundary = /boundary=([^;]+)/.exec(contentType)?.[1] ?? '';
      return Buffer.from(body).toString('latin1').split(boundary).join('<b>');
    };
    expect(norm(am.body, am.contentType)).toBe(norm(bm.body, bm.contentType));
  }, 30_000);
});
