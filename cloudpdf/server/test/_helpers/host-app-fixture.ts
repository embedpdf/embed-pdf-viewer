import { createHash, randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
} from '../../src/index';
import { buildAppForTesting } from '../../src/app/buildApp';
import { createValidTestLicenseGate } from '../../src/licensing/testing';
import type { EngineHostClient } from '../../src/runtime/EngineHostClient';
import type { ObjectStoreWithInfo } from '../../src/storage/ObjectStore';

/**
 * Full host-mode app fixture shared by the write-fence boundary suite
 * and the quarantine HTTP tests: sqlite-memory db, gated FsObjectStore
 * (arm `gate.match` + `gate.gate` to block matching puts), the stub
 * worker inside a real forked engine host, and HTTP listen on an
 * ephemeral port.
 */

export const HOST_FIXTURE_SECRET = 'host-fixture-secret';
const STUB_ENTRY = new URL('./stub-worker-entry.cjs', import.meta.url);

export interface GateState {
  match: RegExp | null;
  gate: Promise<void> | null;
  /** Resolves when a matching put has started waiting on the gate. */
  onWaiting: (() => void) | null;
}

export function gatedStore(inner: ObjectStoreWithInfo, state: GateState): ObjectStoreWithInfo {
  return new Proxy(inner, {
    get(target, prop, receiver) {
      if (prop === 'put') {
        return async (key: string, ...rest: unknown[]) => {
          if (state.gate && state.match?.test(key)) {
            state.onWaiting?.();
            await state.gate;
          }
          return (target as unknown as Record<string, (...a: unknown[]) => unknown>)['put']!(
            key,
            ...rest,
          );
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  }) as ObjectStoreWithInfo;
}

export interface HostFixture {
  bundle: AppBundle;
  db: Kysely<DbSchema>;
  baseUrl: string;
  storageRoot: string;
  cacheRoot: string;
  gate: GateState;
  client: EngineHostClient;
}

export async function buildHostFixture(
  opts: {
    engineUnreadyAfterMs?: number;
    quarantine?: { enforce?: boolean; ttlHours?: number };
    metrics?: boolean;
    scheduling?: import('../../src/runtime/SchedulingEnginePool').EngineSchedulingConfig;
  } = {},
): Promise<HostFixture> {
  const storageRoot = await mkdtemp(join(tmpdir(), 'hostfx-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'hostfx-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const gate: GateState = { match: null, gate: null, onWaiting: null };
  const store = gatedStore(new FsObjectStore({ root: storageRoot }), gate);
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret: HOST_FIXTURE_SECRET },
    workerEntry: STUB_ENTRY,
    poolSize: 1,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 1024 * 1024,
    engineIsolation: 'host',
    ...(opts.engineUnreadyAfterMs !== undefined
      ? { engineUnreadyAfterMs: opts.engineUnreadyAfterMs }
      : {}),
    ...(opts.quarantine ? { quarantine: opts.quarantine } : {}),
    ...(opts.metrics ? { metrics: true } : {}),
    ...(opts.scheduling ? { scheduling: opts.scheduling } : {}),
  });
  const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
  const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
  return {
    bundle,
    db,
    baseUrl,
    storageRoot,
    cacheRoot,
    gate,
    client: bundle.engineHost!,
  };
}

export async function tearDownHostFixture(fx: HostFixture | undefined): Promise<void> {
  if (!fx) return;
  fx.gate.gate = null;
  await fx.bundle.shutdown();
  await fx.db.destroy();
  await rm(fx.storageRoot, { recursive: true, force: true });
  await rm(fx.cacheRoot, { recursive: true, force: true });
}

export function docToken(tenantId: string, docId: string, layerName: string): string {
  return signDevToken(HOST_FIXTURE_SECRET, {
    sub: 'user-1',
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
  });
}

/** Seeds a stub-readable document; returns its base sha. */
export async function seedDocument(
  fx: HostFixture,
  tenantId: string,
  docId: string,
): Promise<string> {
  const bytes = new Uint8Array(4096);
  bytes[0] = 2; // stub: byte 0 = page count
  bytes.set(randomBytes(4095), 1);
  const sha = createHash('sha256').update(bytes).digest('hex');
  const storage = new FsObjectStore({ root: fx.storageRoot });
  await storage.put(StorageKeys.basePdf(tenantId, docId), bytes, {
    contentLength: bytes.byteLength,
  });
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
      storage_size_bytes: bytes.byteLength,
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

export function createAnnotation(
  fx: HostFixture,
  tenantId: string,
  docId: string,
  layerName: string,
  contents: string,
): Promise<Response> {
  return fetch(`${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${docToken(tenantId, docId, layerName)}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      subtype: 'highlight',
      contents,
      quadPoints: [
        { p1: { x: 0, y: 0 }, p2: { x: 10, y: 0 }, p3: { x: 0, y: 10 }, p4: { x: 10, y: 10 } },
      ],
    }),
  });
}

export async function listAnnotations(
  fx: HostFixture,
  tenantId: string,
  docId: string,
  layerName: string,
): Promise<{ status: number; body: string }> {
  const res = await fetch(
    `${fx.baseUrl}/v1/docs/${docId}/layers/${layerName}/annotations/pages/1/items`,
    { headers: { Authorization: `Bearer ${docToken(tenantId, docId, layerName)}` } },
  );
  return { status: res.status, body: await res.text() };
}

export async function until(fn: () => boolean, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!fn()) {
    if (Date.now() > deadline) throw new Error('until: condition not met in time');
    await new Promise((r) => setTimeout(r, 10));
  }
}

export const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
