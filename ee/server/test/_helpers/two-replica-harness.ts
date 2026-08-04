import { createHash, randomBytes } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { FastifyInstance } from 'fastify';
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

const STUB_ENTRY = new URL('./stub-worker-entry.cjs', import.meta.url);

export const REPLICA_SECRET = 'two-replica-secret';

/**
 * The database side of a replica cluster. `setup` prepares ONE shared
 * database (schema + migrations); `connect` opens a NEW connection to it
 * for each replica — mirroring production, where every replica has its
 * own pool against the same Postgres.
 */
export interface ReplicaDbFactory {
  label: string;
  /**
   * Whether two commit transactions can genuinely overlap between their
   * version read and their layers UPDATE on this engine. True for
   * Postgres (MVCC, row locks). False for SQLite: the database-level
   * single writer + snapshot-upgrade rules make the overlap window
   * unrepresentable — which is also why SQLite deployments never hit the
   * race the overlap test encodes.
   */
  supportsCommitOverlap: boolean;
  setup(dir: string): Promise<{
    connect(): Promise<Kysely<DbSchema>>;
    destroy(): Promise<void>;
  }>;
}

/** Shared SQLite file in the cluster dir; WAL + busy_timeout via createSqliteDb. */
export function sqliteReplicaFactory(): ReplicaDbFactory {
  return {
    label: 'sqlite',
    supportsCommitOverlap: false,
    setup: async (dir: string) => {
      const dbPath = join(dir, 'shared.db');
      const bootstrap = createSqliteDb({ path: dbPath });
      await migrate(bootstrap, { source: { kind: 'inline', migrations: sqliteMigrations } });
      await bootstrap.destroy();
      return {
        connect: async () => createSqliteDb({ path: dbPath }),
        destroy: async () => undefined,
      };
    },
  };
}

/**
 * One "replica": a full AppBundle with its OWN worker pool, its own layer
 * sessions, and its own cache — sharing the SQLite file and the object
 * store with its siblings. This is exactly the production multi-replica
 * topology (shared Postgres + shared S3, private worker memory), scaled
 * down to a temp directory.
 */
export interface Replica {
  name: string;
  bundle: AppBundle;
  app: FastifyInstance;
  db: Kysely<DbSchema>;
  baseUrl: string;
}

export interface ReplicaCluster {
  dir: string;
  storageRoot: string;
  storage: FsObjectStore;
  replicas: Replica[];
  /** Boot another replica against the same durable truth. */
  addReplica(name: string): Promise<Replica>;
  /** Insert a ready document directly into shared truth (stub-PDF bytes). */
  seedDocument(tenantId: string, docId: string, opts: { pageCount: number }): Promise<void>;
  teardown(): Promise<void>;
}

/**
 * Boot N replicas over ONE shared database (via the factory) + one shared
 * FsObjectStore — production's multi-replica topology (shared Postgres +
 * shared S3, private worker memory per replica), scaled to a temp dir.
 */
export async function makeReplicaCluster(
  count = 2,
  factory: ReplicaDbFactory = sqliteReplicaFactory(),
): Promise<ReplicaCluster> {
  const dir = await mkdtemp(join(tmpdir(), 'epdf-replicas-'));
  const storageRoot = join(dir, 'objects');
  const storage = new FsObjectStore({ root: storageRoot });
  const replicas: Replica[] = [];
  const dbEnv = await factory.setup(dir);

  const addReplica = async (name: string): Promise<Replica> => {
    const db = await dbEnv.connect();
    const bundle = await buildAppForTesting({
      licenseGate: createValidTestLicenseGate(),
      verifier: { mode: 'hs256', secret: REPLICA_SECRET },
      workerEntry: STUB_ENTRY,
      poolSize: 1,
      db,
      objectStore: new FsObjectStore({ root: storageRoot }),
      autoProvisionTenant: true,
      sweepIntervalMs: 0,
      cacheRoot: join(dir, `cache-${name}`),
      cacheMaxBytes: 1024 * 1024,
    });
    const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
    const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
    const replica: Replica = { name, bundle, app: bundle.app, db, baseUrl };
    replicas.push(replica);
    return replica;
  };

  for (let i = 0; i < count; i++) {
    await addReplica(String.fromCharCode(97 + i)); // a, b, c, …
  }

  return {
    dir,
    storageRoot,
    storage,
    replicas,
    addReplica,
    seedDocument: async (tenantId, docId, opts) => {
      const anyDb = replicas[0]!.db;
      const bytes = new Uint8Array(4096);
      bytes[0] = opts.pageCount;
      bytes.set(randomBytes(4095), 1);
      const sha = createHash('sha256').update(bytes).digest('hex');
      await storage.put(StorageKeys.basePdf(tenantId, docId), bytes, {
        contentLength: bytes.byteLength,
      });
      await anyDb
        .insertInto('tenants')
        .values({ id: tenantId, name: tenantId })
        .onConflict((oc) => oc.column('id').doNothing())
        .execute();
      const now = Date.now();
      await anyDb
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
    },
    teardown: async () => {
      for (const replica of replicas) {
        await replica.bundle.shutdown();
        await replica.db.destroy();
      }
      await dbEnv.destroy();
      await rm(dir, { recursive: true, force: true });
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Seams for deterministic failure/interleaving injection.
 *
 *  All three wrap PRIVATE members of a replica's live LayerService —
 *  deliberate test pragmatism: the alternative is production-code test
 *  hooks, and these seams sit exactly at the boundaries the multi-replica
 *  invariants are about (worker-apply → artifact upload → commit tx).
 * ------------------------------------------------------------------ */

interface UploadPatchable {
  uploadLayerArtifact: (...args: unknown[]) => Promise<unknown>;
}

/**
 * Trap the replica's NEXT artifact upload: `held` resolves once the
 * mutation has been applied in the worker and is about to upload —
 * i.e. inside the dirty window, before any durable commit. `release()`
 * lets the write proceed. Subsequent uploads (e.g. a rebase re-run)
 * pass through untouched.
 */
export function holdNextUpload(replica: Replica): { held: Promise<void>; release: () => void } {
  const svc = replica.bundle.layerService as unknown as UploadPatchable;
  const original = svc.uploadLayerArtifact.bind(svc);
  let heldResolve!: () => void;
  let gateResolve!: () => void;
  const held = new Promise<void>((resolve) => (heldResolve = resolve));
  const gate = new Promise<void>((resolve) => (gateResolve = resolve));
  svc.uploadLayerArtifact = async (...args: unknown[]) => {
    svc.uploadLayerArtifact = original; // one-shot: restore before proceeding
    heldResolve();
    await gate;
    return original(...args);
  };
  return { held, release: gateResolve };
}

/** Make the replica's NEXT artifact upload fail (post-apply, pre-commit). */
export function failNextUpload(replica: Replica, message = 'injected upload failure'): void {
  const svc = replica.bundle.layerService as unknown as UploadPatchable;
  const original = svc.uploadLayerArtifact.bind(svc);
  svc.uploadLayerArtifact = async () => {
    svc.uploadLayerArtifact = original;
    throw new Error(message);
  };
}

interface AuditAppendPatchable {
  eventLog?: { appendDb: (...args: unknown[]) => Promise<unknown> };
}

/**
 * Trap the replica's NEXT audit append — which runs INSIDE the commit
 * transaction, after the version read and before the layers UPDATE. Two
 * replicas held here have both passed the version check at the same N:
 * releasing them makes the transactions genuinely overlap in the
 * read→update window (the race a conditional UPDATE must win).
 */
export function holdNextAuditAppend(replica: Replica): {
  held: Promise<void>;
  release: () => void;
} {
  const svc = replica.bundle.layerService as unknown as AuditAppendPatchable;
  const eventLog = svc.eventLog;
  if (!eventLog) throw new Error('holdNextAuditAppend: replica has no eventLog');
  const original = eventLog.appendDb.bind(eventLog);
  let heldResolve!: () => void;
  let gateResolve!: () => void;
  const held = new Promise<void>((resolve) => (heldResolve = resolve));
  const gate = new Promise<void>((resolve) => (gateResolve = resolve));
  eventLog.appendDb = async (...args: unknown[]) => {
    eventLog.appendDb = original;
    const result = await original(...args);
    heldResolve();
    await gate;
    return result;
  };
  return { held, release: gateResolve };
}

/**
 * The artifact objects currently stored for one layer (committed AND
 * orphaned attempts) — the probe behind the "no orphan leak" assertions.
 */
export async function listLayerArtifactObjects(
  cluster: ReplicaCluster,
  tenantId: string,
  docId: string,
  layerName: string,
): Promise<string[]> {
  // StorageKeys owns the key grammar (incl. the hash shard) — never
  // hand-build storage paths in tests.
  const dir = join(
    cluster.storageRoot,
    StorageKeys.docRoot(tenantId, docId),
    'layers',
    encodeURIComponent(layerName),
  );
  try {
    return (await readdir(dir)).filter((name) => name.endsWith('.layer')).sort();
  } catch {
    return [];
  }
}

export function docToken(tenantId: string, docId: string, layerName: string, sub = 'user-1') {
  return signDevToken(REPLICA_SECRET, {
    sub,
    tenant_id: tenantId,
    doc_id: docId,
    layer_name: layerName,
    scope: ['*'],
  });
}

export function highlightDraft(contents: string): unknown {
  return {
    subtype: 'highlight',
    contents,
    quadPoints: [
      {
        p1: { x: 0, y: 0 },
        p2: { x: 10, y: 0 },
        p3: { x: 0, y: 10 },
        p4: { x: 10, y: 10 },
      },
    ],
  };
}

export interface AnnotationListBody {
  annotations: Array<{ nm: string | null; contents: string | null }>;
}

/** GET the annotation list for page `pon` through one replica's HTTP API. */
export async function listAnnotations(
  replica: Replica,
  input: { tenantId: string; docId: string; layerName: string; pon?: number },
): Promise<AnnotationListBody> {
  const pon = input.pon ?? 1;
  const res = await fetch(
    `${replica.baseUrl}/v1/docs/${input.docId}/layers/${input.layerName}/annotations/pages/${pon}/items`,
    {
      headers: {
        Authorization: `Bearer ${docToken(input.tenantId, input.docId, input.layerName)}`,
      },
    },
  );
  if (res.status !== 200) {
    throw new Error(`listAnnotations via ${replica.name}: HTTP ${res.status} ${await res.text()}`);
  }
  return (await res.json()) as AnnotationListBody;
}

/** POST an annotation create through one replica's HTTP API. */
export async function createAnnotation(
  replica: Replica,
  input: { tenantId: string; docId: string; layerName: string; pon?: number; contents: string },
): Promise<{ status: number; body: unknown }> {
  const pon = input.pon ?? 1;
  const res = await fetch(
    `${replica.baseUrl}/v1/docs/${input.docId}/layers/${input.layerName}/annotations/pages/${pon}/items`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${docToken(input.tenantId, input.docId, input.layerName)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(highlightDraft(input.contents)),
    },
  );
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** PATCH one annotation (by durable objectNumber key) through one replica. */
export async function updateAnnotation(
  replica: Replica,
  input: {
    tenantId: string;
    docId: string;
    layerName: string;
    pon?: number;
    objectNumber: number;
    contents: string;
  },
): Promise<{ status: number; body: unknown }> {
  const pon = input.pon ?? 1;
  const res = await fetch(
    `${replica.baseUrl}/v1/docs/${input.docId}/layers/${input.layerName}/annotations/pages/${pon}/items/obj:${input.objectNumber}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${docToken(input.tenantId, input.docId, input.layerName)}`,
        'Content-Type': 'application/json',
      },
      // The patch schema is a discriminated union — `subtype` picks the arm.
      body: JSON.stringify({ patch: { subtype: 'highlight', contents: input.contents } }),
    },
  );
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

/** DELETE one annotation (by durable objectNumber key) through one replica. */
export async function deleteAnnotation(
  replica: Replica,
  input: { tenantId: string; docId: string; layerName: string; pon?: number; objectNumber: number },
): Promise<{ status: number; body: unknown }> {
  const pon = input.pon ?? 1;
  const res = await fetch(
    `${replica.baseUrl}/v1/docs/${input.docId}/layers/${input.layerName}/annotations/pages/${pon}/items/obj:${input.objectNumber}`,
    {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${docToken(input.tenantId, input.docId, input.layerName)}`,
      },
    },
  );
  const body: unknown = await res.json().catch(() => null);
  return { status: res.status, body };
}

/**
 * Create with bounded client-side retries on 409 — the contract a real
 * client follows when the server exhausts its rebase budget under write
 * pressure (LayerVersionConflict is retryable by definition: the op was
 * NOT applied).
 */
export async function createAnnotationWithRetry(
  replica: Replica,
  input: { tenantId: string; docId: string; layerName: string; pon?: number; contents: string },
  maxRetries = 5,
): Promise<{ status: number; attempts: number; body: unknown }> {
  for (let attempt = 1; ; attempt++) {
    const { status, body } = await createAnnotation(replica, input);
    if (status !== 409 || attempt > maxRetries) {
      return { status, attempts: attempt, body };
    }
    await new Promise((resolve) => setTimeout(resolve, 5 * attempt));
  }
}

/**
 * Parse the stub worker's v2 layer artifact ([0x4c, 0x02, ...utf8 JSON])
 * back into its annotation records — the durable-truth probe used by the
 * lost-update assertions.
 */
export function parseStubArtifact(
  bytes: Uint8Array,
): Array<{ nm: string; contents: string | null }> {
  const buf = Buffer.from(bytes);
  if (buf.byteLength < 2 || buf[0] !== 0x4c || buf[1] !== 0x02) return [];
  const parsed = JSON.parse(buf.subarray(2).toString('utf8')) as {
    annots: Array<{ nm: string; contents: string | null }>;
  };
  return parsed.annots;
}

/** Read the CURRENT layer artifact from shared storage and parse it. */
export async function readCurrentArtifact(
  cluster: ReplicaCluster,
  docId: string,
  layerName: string,
): Promise<{ version: number; annots: Array<{ nm: string; contents: string | null }> }> {
  const row = await cluster.replicas[0]!.db.selectFrom('layers')
    .select(['current_version', 'current_artifact_key'])
    .where('doc_id', '=', docId)
    .where('name', '=', layerName)
    .executeTakeFirstOrThrow();
  const bytes = await cluster.storage.get(row.current_artifact_key!);
  return {
    version: Number(row.current_version),
    annots: bytes ? parseStubArtifact(bytes) : [],
  };
}
