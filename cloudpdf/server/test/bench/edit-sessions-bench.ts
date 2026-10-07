/**
 * Editing sessions under load: many sessions on one database, spread over
 * `--layers` layers, at the cost the server pays for them (the SQL of
 * `/access`, the event stream's heartbeat and a write's commit; no engine,
 * no HTTP). `--layers 1` is the worst case: every session on one layer,
 * whose one counter row each handout and commit locks.
 *
 *   node --import tsx --import ./test/bench/register-sql-loader.mjs \
 *     test/bench/edit-sessions-bench.ts [--sessions 10000] [--layers 100] \
 *     [--minutes 10] [--writes 2000] [--concurrency 32] [--pg postgres://…] \
 *     [--json out.json]
 *
 * Time is simulated, so a session's lifetime passes in seconds:
 *
 *   access     — every session opens: touch + 8 numbers, one transaction.
 *   heartbeat  — every 25 simulated seconds, each session's stream looks it
 *                up and keeps it alive (touch + held, one transaction); the
 *                expiry moves only when less than half the lifetime is left.
 *   commit     — writes interleaved with the heartbeats: a range from the
 *                counter, then spend one held number, settle the range,
 *                touch, and a top-up of 4, in one transaction.
 *
 * Reports p50/p99 of each, and the session writes the heartbeats cost per
 * simulated second (lazy extension's point: about sessions / 450 s).
 * `--quick` shrinks everything for a smoke run.
 */
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';

import {
  createPostgresDb,
  createSqliteDb,
  DocumentsRepo,
  LayersRepo,
  migrate,
  postgresMigrations,
  sqliteMigrations,
  type DbSchema,
} from '../../src/index';
import {
  EDIT_SESSION_LIFETIME_MS,
  FIRST_OBJECT_NUMBERS,
  ObjectNumberService,
  type EditSessionKey,
} from '../../src/services/ObjectNumberService';

const argv = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const quick = argv.includes('--quick');
const SESSIONS = Number(flag('--sessions') ?? (quick ? 1_000 : 10_000));
const LAYERS = Number(flag('--layers') ?? 100);
const MINUTES = Number(flag('--minutes') ?? (quick ? 2 : 10));
const WRITES = Number(flag('--writes') ?? (quick ? 200 : 2_000));
const CONCURRENCY = Number(flag('--concurrency') ?? 32);
const PG = flag('--pg');
const JSON_OUT = flag('--json');
const HEARTBEAT_MS = 25_000;

const TENANT = 'tenant-bench';
const DOC = 'doc-bench';
const BASE = 'b'.repeat(64);

/** Run `jobs` with at most `CONCURRENCY` in flight; each job's latency in ms. */
async function timed(jobs: Array<() => Promise<unknown>>): Promise<number[]> {
  const latencies: number[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, async () => {
      while (next < jobs.length) {
        const job = jobs[next++]!;
        const started = performance.now();
        await job();
        latencies.push(performance.now() - started);
      }
    }),
  );
  return latencies;
}

function summary(latencies: number[], seconds: number) {
  if (latencies.length === 0) return { count: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
  return {
    count: sorted.length,
    perSecond: Math.round(sorted.length / seconds),
    p50: Number(at(0.5).toFixed(2)),
    p99: Number(at(0.99).toFixed(2)),
    max: Number(sorted[sorted.length - 1]!.toFixed(2)),
  };
}

async function openDb(dir: string): Promise<Kysely<DbSchema>> {
  if (!PG) {
    const db = createSqliteDb({ path: join(dir, 'bench.db') });
    await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
    return db;
  }
  const schema = `bench_${process.pid}_${Date.now()}`;
  const bootstrap = createPostgresDb({ connectionString: PG, poolMax: 1 });
  await sql.raw(`CREATE SCHEMA "${schema}"`).execute(bootstrap);
  await bootstrap.destroy();
  const sep = PG.includes('?') ? '&' : '?';
  const db = createPostgresDb({
    connectionString: `${PG}${sep}options=-c%20search_path%3D${schema}`,
    poolMax: CONCURRENCY,
  });
  await migrate(db, { source: { kind: 'inline', migrations: postgresMigrations } });
  return db;
}

async function main(): Promise<void> {
  const dir = await mkdtemp(join(tmpdir(), 'edit-sessions-bench-'));
  const db = await openDb(dir);
  try {
    await db.insertInto('tenants').values({ id: TENANT, name: TENANT }).execute();
    const documents = new DocumentsRepo(db);
    await documents.createPending({
      id: DOC,
      tenantId: TENANT,
      metadata: null,
      idempotencyKey: null,
      createdBy: null,
    });
    await documents.commit({ id: DOC, tenantId: TENANT, baseSha: BASE, storageSizeBytes: 1 });
    const layers = new LayersRepo(db);
    const layerIds: string[] = [];
    for (let i = 0; i < LAYERS; i++) {
      const layer = await layers.createEmpty({
        id: `layer-${i}`,
        docId: DOC,
        tenantId: TENANT,
        name: `layer-${i}`,
        baseSha: BASE,
      });
      layerIds.push(layer.id);
    }
    let clock = Date.now();
    const numbers = new ObjectNumberService({ db, now: () => clock });
    // Count the writes that move a session's expiry.
    let extensions = 0;
    const repo = (numbers as unknown as { repo: { extendSession: (...args: never[]) => unknown } })
      .repo;
    const extendSession = repo.extendSession.bind(repo);
    repo.extendSession = (...args: never[]) => {
      extensions++;
      return extendSession(...args);
    };
    for (const layerId of layerIds) await numbers.startCounter(db, layerId, 1_000);
    const sessions: EditSessionKey[] = Array.from({ length: SESSIONS }, (_, i) => ({
      layerId: layerIds[i % LAYERS]!,
      sessionId: `cloud:${i}`,
      sub: `user-${i}`,
    }));

    // Every session opens.
    let started = performance.now();
    const access = await timed(
      sessions.map(
        (key) => () =>
          db.transaction().execute(async (trx) => {
            await numbers.touchSession(trx, key);
            await numbers.issue(trx, key, FIRST_OBJECT_NUMBERS);
          }),
      ),
    );
    const accessSummary = summary(access, (performance.now() - started) / 1000);

    // Heartbeats for MINUTES simulated minutes, with writes spread over them.
    const rounds = Math.ceil((MINUTES * 60_000) / HEARTBEAT_MS);
    const writesPerRound = Math.ceil(WRITES / rounds);
    const extensionsBefore = extensions;
    const heartbeat: number[] = [];
    const commit: number[] = [];
    let burst = 0;
    let writer = 0;
    started = performance.now();
    for (let round = 0; round < rounds; round++) {
      clock += HEARTBEAT_MS;
      const roundStart = extensions;
      const beats = sessions.map((key) => async () => {
        if (!(await numbers.findSession(db, key))) return;
        await db.transaction().execute(async (trx) => {
          await numbers.touchSession(trx, key);
          await numbers.held(trx, key);
        });
      });
      const writes = Array.from({ length: writesPerRound }, () => {
        const key = sessions[writer++ % sessions.length]!;
        return async () => {
          const [named] = (await numbers.held(db, key)).map((range) => range.first);
          const range = await numbers.reserveForWrite(key.layerId, BASE, 64);
          await db.transaction().execute(async (trx) => {
            if (named !== undefined) await numbers.spend(trx, key, [named]);
            await numbers.settleWrite(trx, key.layerId, range, range.floor);
            await numbers.touchSession(trx, key);
            await numbers.issue(trx, key, 4);
          });
        };
      });
      // Interleave: a write after every few heartbeats.
      const every = Math.max(1, Math.floor(beats.length / Math.max(1, writes.length)));
      const kinds: Array<'beat' | 'write'> = [];
      const jobs: Array<() => Promise<unknown>> = [];
      for (let i = 0, w = 0; i < beats.length; i++) {
        jobs.push(beats[i]!);
        kinds.push('beat');
        if (i % every === 0 && w < writes.length) {
          jobs.push(writes[w++]!);
          kinds.push('write');
        }
      }
      const latencies = await timedByKind(jobs, kinds);
      heartbeat.push(...latencies.beat);
      commit.push(...latencies.write);
      burst = Math.max(burst, extensions - roundStart);
    }
    const seconds = (performance.now() - started) / 1000;
    const extended = extensions - extensionsBefore;
    const simulatedSeconds = (rounds * HEARTBEAT_MS) / 1000;

    const report = {
      database: PG ? 'postgres' : 'sqlite',
      sessions: SESSIONS,
      layers: LAYERS,
      simulatedMinutes: MINUTES,
      concurrency: CONCURRENCY,
      access: accessSummary,
      heartbeat: summary(heartbeat, seconds),
      commit: summary(commit, seconds),
      sessionWrites: {
        extensions: extended,
        perSimulatedSecond: Number((extended / simulatedSeconds).toFixed(1)),
        // Sessions that started together extend together: the worst round.
        largestRound: burst,
        expectedPerSimulatedSecond: Number(
          (SESSIONS / (EDIT_SESSION_LIFETIME_MS / 2 / 1000)).toFixed(1),
        ),
      },
    };
    console.log(JSON.stringify(report, null, 2));
    if (JSON_OUT) await writeFile(JSON_OUT, JSON.stringify(report, null, 2));
  } finally {
    await db.destroy();
    await rm(dir, { recursive: true, force: true });
  }

  /** Same as `timed`, with each job's latency kept under its kind. */
  async function timedByKind(
    jobs: Array<() => Promise<unknown>>,
    kinds: Array<'beat' | 'write'>,
  ): Promise<{ beat: number[]; write: number[] }> {
    const out = { beat: [] as number[], write: [] as number[] };
    const wrapped = jobs.map((job, i) => async () => {
      const t = performance.now();
      await job();
      out[kinds[i]!].push(performance.now() - t);
    });
    await timed(wrapped);
    return out;
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
