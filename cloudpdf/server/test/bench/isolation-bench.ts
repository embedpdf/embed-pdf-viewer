/**
 * WS3 §8 — the perf + backpressure gate.
 *
 * Compute-only boundary measurements: direct pool dispatches (no derived
 * read-through, no HTTP cache) so EVERY iteration crosses the engine
 * boundary. Run once per mode and compare:
 *
 *   node --import tsx --import ./test/bench/register-sql-loader.mjs \
 *     test/bench/isolation-bench.ts --mode inline --json /tmp/inline.json
 *   (and again with --mode host)
 *
 * Gate (plan §8): cold compute-only host p95 ≤ 1.10 × inline p95 per op
 * class at each concurrency level; no RSS pathology; no event-loop-delay
 * pathology. `--quick` shrinks iteration counts for smoke runs.
 *
 * Op classes:
 *   render    — pages.render, raw rgba8 rasters (~1–3 MB) cross the
 *               boundary; unique width per iteration (off-lattice).
 *   metadata  — metadata.read, tiny payloads: fixed per-call overhead.
 *   open      — one open+close cycle of a real ~900 KB PDF, fresh docId
 *               per iteration: the recovery-path cost.
 *
 * Plus (host only) kill-under-load: SIGKILL the engine host while renders
 * are in flight at concurrency 8 — asserts every in-flight call settles
 * (clean rejections, no hangs), measures time back to first successful
 * render, and samples API event-loop delay across the window.
 *
 * Also reports a cold END-TO-END section (HTTP render route, off-lattice
 * → compute path incl. sharp encode) for real-traffic proportion; warm
 * on-lattice traffic is served by the WS2b store read-through and never
 * touches this boundary (covered by DerivedRenderService tests).
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { wirePack, type WorkerJobId } from '@embedpdf/engine-core/runtime';
import {
  createSqliteDb,
  migrate,
  sqliteMigrations,
  FsObjectStore,
  signDevToken,
  StorageKeys,
} from '../../src/index';
import { buildAppForTesting } from '../../src/app/buildApp';
import { createValidTestLicenseGate } from '../../src/licensing/testing';
import { EngineHostClient } from '../../src/runtime/EngineHostClient';
import type { BuildPack, EnginePool } from '../../src/runtime/EnginePool';
import { WorkerThreadPool } from '../../src/runtime/WorkerThreadPool';

type Mode = 'inline' | 'host';

const argv = process.argv.slice(2);
function argOf(flag: string): string | undefined {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
}
const MODE = (argOf('--mode') ?? 'inline') as Mode;
if (MODE !== 'inline' && MODE !== 'host') throw new Error(`--mode inline|host, got ${MODE}`);
const QUICK = argv.includes('--quick');
const JSON_OUT = argOf('--json');

const POOL_SIZE = 2; // the production default (min(2, cpus)); identical in both modes
const N_DOCS = 4; // round-robin so both worker slots stay busy
const CONC_LEVELS = [1, 4, 16];

// The BUILT engine artifacts: production-faithful (no loader inside the
// engine processes), and worker_threads need no TS support. Run
// `pnpm build` first.
const WORKER_ENTRY = new URL('../../dist/runtime/worker-entry.js', import.meta.url);
const HOST_ENTRY = new URL('../../dist/runtime/engine-host-entry.js', import.meta.url);
const PDF_URL = new URL(
  argOf('--pdf') ?? '../../../../examples/viewer-react/public/ebook.pdf',
  import.meta.url,
);
const PDF_PATH = PDF_URL.protocol === 'file:' ? fileURLToPath(PDF_URL) : (argOf('--pdf') as string);

const pdfBytes = readFileSync(PDF_PATH);
const PDF_SHA = createHash('sha256').update(pdfBytes).digest('hex');

// ---------------------------------------------------------------- helpers

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function pct(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]!;
}

function psRssBytes(pid: number): Promise<number | null> {
  return new Promise((resolve) => {
    execFile('ps', ['-o', 'rss=', '-p', String(pid)], (err, out) => {
      const kb = err ? NaN : parseInt(out.trim(), 10);
      resolve(Number.isFinite(kb) ? kb * 1024 : null);
    });
  });
}

async function rssSnapshot(pool: EnginePool): Promise<{
  api: number;
  child: number | null;
  total: number;
}> {
  const api = process.memoryUsage().rss;
  let child: number | null = null;
  if (pool instanceof EngineHostClient) {
    const pid = pool.hostPid();
    if (pid !== null) child = await psRssBytes(pid);
  }
  return { api, child, total: api + (child ?? 0) };
}

function mb(n: number | null): string {
  return n === null ? '—' : `${(n / (1024 * 1024)).toFixed(1)}MB`;
}

// ---------------------------------------------------------------- builds

function openBuild(docId: string, baseKey: string = PDF_SHA): BuildPack {
  return (jobId: WorkerJobId) =>
    wirePack({
      kind: 'open.layerFileBase' as const,
      jobId,
      docId,
      baseKey,
      basePath: PDF_PATH,
      layer: { kind: 'fresh' as const },
      password: null,
    });
}

function renderBuild(docId: string, pageObjectNumber: number, width: number): BuildPack {
  return (jobId: WorkerJobId) =>
    wirePack({
      kind: 'pages.render' as const,
      jobId,
      docId,
      pageObjectNumber,
      options: { viewport: { kind: 'width' as const, width }, includeAnnotations: false },
    });
}

function renderEncodedBuild(docId: string, pageObjectNumber: number, width: number): BuildPack {
  return (jobId: WorkerJobId) =>
    wirePack({
      kind: 'pages.renderEncoded' as const,
      jobId,
      docId,
      pageObjectNumber,
      options: { viewport: { kind: 'width' as const, width }, includeAnnotations: false },
      encode: { format: 'webp' as const },
    });
}

function metadataBuild(docId: string): BuildPack {
  return (jobId: WorkerJobId) => wirePack({ kind: 'metadata.read' as const, jobId, docId });
}

// off-lattice, deterministic, identical sequence in both modes
const widthFor = (i: number): number => 560 + ((i * 7) % 96);

// ---------------------------------------------------------------- runner

interface LevelResult {
  conc: number;
  iters: number;
  wallMs: number;
  opsPerSec: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  meanMs: number;
  meanBytes: number;
  maxBytes: number;
  estQueuedBytesAtPeak: number;
  peakInFlight: number;
  eldMeanMs: number;
  eldMaxMs: number;
  rss: { api: number; child: number | null; total: number };
}

async function runLevel(
  pool: EnginePool,
  conc: number,
  iters: number,
  dispatch: (i: number) => Promise<number>,
): Promise<LevelResult> {
  const eld = monitorEventLoopDelay({ resolution: 5 });
  eld.enable();
  const lats: number[] = [];
  let inFlight = 0;
  let peakInFlight = 0;
  let bytes = 0;
  let maxBytes = 0;
  let next = 0;
  const t0 = performance.now();
  await Promise.all(
    Array.from({ length: conc }, async () => {
      for (;;) {
        const i = next++;
        if (i >= iters) return;
        inFlight++;
        if (inFlight > peakInFlight) peakInFlight = inFlight;
        const s = performance.now();
        const b = await dispatch(i);
        lats.push(performance.now() - s);
        inFlight--;
        bytes += b;
        if (b > maxBytes) maxBytes = b;
      }
    }),
  );
  const wallMs = performance.now() - t0;
  eld.disable();
  const sorted = [...lats].sort((a, b) => a - b);
  const meanBytes = bytes / iters;
  return {
    conc,
    iters,
    wallMs,
    opsPerSec: (iters / wallMs) * 1000,
    p50: pct(sorted, 50),
    p95: pct(sorted, 95),
    p99: pct(sorted, 99),
    max: sorted[sorted.length - 1] ?? NaN,
    meanMs: lats.reduce((a, b) => a + b, 0) / lats.length,
    meanBytes,
    maxBytes,
    estQueuedBytesAtPeak: Math.round(peakInFlight * meanBytes),
    peakInFlight,
    eldMeanMs: eld.mean / 1e6,
    eldMaxMs: eld.max / 1e6,
    rss: await rssSnapshot(pool),
  };
}

function printLevel(cls: string, r: LevelResult): void {
  // eslint-disable-next-line no-console
  console.log(
    `${cls.padEnd(9)} c=${String(r.conc).padStart(2)} n=${String(r.iters).padStart(4)}  ` +
      `p50=${r.p50.toFixed(1).padStart(7)}ms p95=${r.p95.toFixed(1).padStart(7)}ms ` +
      `p99=${r.p99.toFixed(1).padStart(7)}ms max=${r.max.toFixed(0).padStart(5)}ms  ` +
      `${r.opsPerSec.toFixed(1).padStart(6)} op/s  ` +
      `bytes(mean=${mb(r.meanBytes)} peakQ≈${mb(r.estQueuedBytesAtPeak)})  ` +
      `eld(mean=${r.eldMeanMs.toFixed(1)} max=${r.eldMaxMs.toFixed(1)})ms  ` +
      `rss(api=${mb(r.rss.api)} child=${mb(r.rss.child)} total=${mb(r.rss.total)})`,
  );
}

// ---------------------------------------------------------------- phases

async function makePool(mode: Mode): Promise<EnginePool> {
  if (mode === 'inline') {
    return WorkerThreadPool.create({ size: POOL_SIZE, workerEntry: WORKER_ENTRY });
  }
  return EngineHostClient.create({
    hostEntry: HOST_ENTRY,
    boot: { workerEntry: WORKER_ENTRY.href, poolSize: POOL_SIZE, fonts: [] },
  });
}

interface KillResult {
  rejected: number;
  errorCodes: Record<string, number>;
  recoveryMs: number;
  eldMaxMs: number;
  postRecoveryOk: number;
}

async function killUnderLoad(
  pool: EngineHostClient,
  docIds: string[],
  pons: number[],
): Promise<KillResult> {
  const eld = monitorEventLoopDelay({ resolution: 5 });
  eld.enable();
  const errorCodes: Record<string, number> = {};
  let rejected = 0;
  let killedAt = 0;
  let recoveredAt = 0;
  let stop = false;
  let seq = 0;
  const workers = Promise.all(
    Array.from({ length: 8 }, async (_, w) => {
      for (let i = 0; !stop; i++) {
        const docId = docIds[(i + w) % docIds.length]!;
        try {
          await pool.run(docId, renderBuild(docId, pons[(i + w) % pons.length]!, widthFor(seq++)));
          if (killedAt > 0 && recoveredAt === 0) recoveredAt = performance.now();
        } catch (err) {
          rejected++;
          const code = (err as { code?: string; name?: string }).code ?? (err as Error).name;
          errorCodes[String(code)] = (errorCodes[String(code)] ?? 0) + 1;
          // Mimic DocumentService's lazy reopen: host restarted → docs gone.
          try {
            await pool.runOpen(docId, PDF_SHA, openBuild(docId));
          } catch {
            await sleep(50);
          }
        }
      }
    }),
  );
  await sleep(600);
  const pid = pool.hostPid();
  if (pid === null) throw new Error('kill-under-load: no host pid');
  killedAt = performance.now();
  process.kill(pid, 'SIGKILL');
  const deadline = performance.now() + 30_000;
  while (recoveredAt === 0) {
    if (performance.now() > deadline) {
      stop = true;
      await workers;
      throw new Error('kill-under-load: no successful render within 30s of SIGKILL');
    }
    await sleep(10);
  }
  await sleep(200);
  stop = true;
  await workers;
  eld.disable();
  // post-recovery sanity: renders keep flowing
  let postRecoveryOk = 0;
  for (let i = 0; i < 5; i++) {
    const docId = docIds[i % docIds.length]!;
    try {
      await pool.run(docId, renderBuild(docId, pons[i % pons.length]!, widthFor(1000 + i)));
      postRecoveryOk++;
    } catch {
      await pool.runOpen(docId, PDF_SHA, openBuild(docId)).catch(() => undefined);
    }
  }
  return {
    rejected,
    errorCodes,
    recoveryMs: recoveredAt - killedAt,
    eldMaxMs: eld.max / 1e6,
    postRecoveryOk,
  };
}

interface E2eResult {
  iters: number;
  conc: number;
  p50: number;
  p95: number;
  meanBytes: number;
}

/** Cold end-to-end: HTTP render route, off-lattice widths → compute path
 *  (engine + sharp encode) on every request. */
async function endToEndCold(mode: Mode, pon: number): Promise<E2eResult> {
  const secret = 'isolation-bench-secret';
  const storageRoot = await mkdtemp(join(tmpdir(), 'bench-store-'));
  const cacheRoot = await mkdtemp(join(tmpdir(), 'bench-cache-'));
  const db = createSqliteDb({ path: ':memory:' });
  await migrate(db, { source: { kind: 'inline', migrations: sqliteMigrations } });
  const store = new FsObjectStore({ root: storageRoot });
  const bundle = await buildAppForTesting({
    licenseGate: createValidTestLicenseGate(),
    verifier: { mode: 'hs256', secret },
    workerEntry: WORKER_ENTRY,
    poolSize: POOL_SIZE,
    db,
    objectStore: store,
    autoProvisionTenant: true,
    sweepIntervalMs: 0,
    cacheRoot,
    cacheMaxBytes: 512 * 1024 * 1024,
    ...(mode === 'host' ? { engineIsolation: 'host' as const, engineHostEntry: HOST_ENTRY } : {}),
  });
  try {
    const addr = await bundle.app.listen({ host: '127.0.0.1', port: 0 });
    const baseUrl = typeof addr === 'string' ? addr : `http://127.0.0.1:${addr}`;
    const tenantId = 'bench-tenant';
    const docId = 'bench-e2e-doc';
    await store.put(StorageKeys.basePdf(tenantId, docId), pdfBytes, {
      contentLength: pdfBytes.byteLength,
    });
    await db
      .insertInto('tenants')
      .values({ id: tenantId, name: tenantId })
      .onConflict((oc) => oc.column('id').doNothing())
      .execute();
    const now = Date.now();
    await db
      .insertInto('documents')
      .values({
        id: docId,
        tenant_id: tenantId,
        state: 'ready',
        base_sha: PDF_SHA,
        storage_size_bytes: pdfBytes.byteLength,
        metadata_json: null,
        idempotency_key: null,
        failure_reason: null,
        created_at: now,
        updated_at: now,
        created_by: null,
      })
      .execute();
    const token = signDevToken(secret, {
      sub: 'bench',
      tenant_id: tenantId,
      doc_id: docId,
      layer_name: 'bench',
      scope: ['*'],
    });

    const iters = QUICK ? 8 : 16;
    const conc = 4;
    const lats: number[] = [];
    let bytes = 0;
    let next = 0;
    await Promise.all(
      Array.from({ length: conc }, async () => {
        for (;;) {
          const i = next++;
          if (i >= iters) return;
          const width = 561 + ((i * 11) % 90); // off-lattice + unique → always computes
          const s = performance.now();
          const res = await fetch(
            `${baseUrl}/v1/docs/${docId}/render/pages/${pon}/data?viewport.kind=width&viewport.width=${width}&format=webp`,
            { headers: { Authorization: `Bearer ${token}` } },
          );
          const body = await res.arrayBuffer();
          if (res.status !== 200) {
            throw new Error(`e2e render ${res.status}: ${Buffer.from(body).toString()}`);
          }
          lats.push(performance.now() - s);
          bytes += body.byteLength;
        }
      }),
    );
    const sorted = [...lats].sort((a, b) => a - b);
    return { iters, conc, p50: pct(sorted, 50), p95: pct(sorted, 95), meanBytes: bytes / iters };
  } finally {
    await bundle.shutdown();
    await db.destroy();
    await rm(storageRoot, { recursive: true, force: true });
    await rm(cacheRoot, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `isolation-bench mode=${MODE} pool=${POOL_SIZE} pdf=${PDF_PATH} (${mb(pdfBytes.byteLength)}) sha=${PDF_SHA.slice(0, 12)} node=${process.version} ${process.platform}/${process.arch}`,
  );
  const pool = await makePool(MODE);
  const results: Record<string, LevelResult[]> = {};
  let kill: KillResult | null = null;
  let e2e: E2eResult | null = null;
  let e2ePon = 0;
  try {
    const docIds = Array.from({ length: N_DOCS }, (_, i) => `bench-doc-${i}`);
    for (const docId of docIds) await pool.runOpen(docId, PDF_SHA, openBuild(docId));
    const list = await pool.run(docIds[0]!, (jobId: WorkerJobId) =>
      wirePack({ kind: 'pages.list' as const, jobId, docId: docIds[0]! }),
    );
    if (list.tag !== 'pages.list') throw new Error(`unexpected ${list.tag}`);
    const pons = list.snapshot.pages.slice(0, 8).map((p) => p.pageObjectNumber);
    e2ePon = pons[0]!;
    // eslint-disable-next-line no-console
    console.log(`opened ${N_DOCS} docs, ${list.snapshot.pageCount} pages, using pons=${pons.join(',')}`);

    // ---- render (large payloads)
    const renderIters = QUICK ? 40 : 300;
    let warm = 0;
    await runLevel(pool, 2, QUICK ? 8 : 24, async (i) => {
      const docId = docIds[i % N_DOCS]!;
      const r = await pool.run(docId, renderBuild(docId, pons[i % pons.length]!, widthFor(i)));
      return r.tag === 'pages.render' ? r.raster.data.byteLength : 0;
    });
    results['render'] = [];
    for (const conc of CONC_LEVELS) {
      const r = await runLevel(pool, conc, renderIters, async (i) => {
        const docId = docIds[i % N_DOCS]!;
        const res = await pool.run(
          docId,
          renderBuild(docId, pons[(i + warm) % pons.length]!, widthFor(i)),
        );
        if (res.tag !== 'pages.render') throw new Error(`unexpected ${res.tag}`);
        return res.raster.data.byteLength;
      });
      warm += renderIters;
      results['render'].push(r);
      printLevel('render', r);
    }

    // ---- render-enc (WS3 Phase B): render + encode in ONE worker op —
    // only the compressed webp crosses the boundary.
    results['render-enc'] = [];
    for (const conc of CONC_LEVELS) {
      const r = await runLevel(pool, conc, renderIters, async (i) => {
        const docId = docIds[i % N_DOCS]!;
        const res = await pool.run(
          docId,
          renderEncodedBuild(docId, pons[(i + warm) % pons.length]!, widthFor(i)),
        );
        if (res.tag !== 'pages.renderEncoded') throw new Error(`unexpected ${res.tag}`);
        return res.image.bytes.byteLength;
      });
      warm += renderIters;
      results['render-enc'].push(r);
      printLevel('renderEnc', r);
    }

    // ---- metadata (tiny payloads: fixed per-call overhead)
    const metaIters = QUICK ? 150 : 1000;
    results['metadata'] = [];
    for (const conc of CONC_LEVELS) {
      const r = await runLevel(pool, conc, metaIters, async (i) => {
        const docId = docIds[i % N_DOCS]!;
        const res = await pool.run(docId, metadataBuild(docId));
        if (res.tag !== 'metadata.read') throw new Error(`unexpected ${res.tag}`);
        return JSON.stringify(res.metadata).length;
      });
      results['metadata'].push(r);
      printLevel('metadata', r);
    }

    // ---- cold open (recovery-path cost). A UNIQUE baseKey per iteration
    // defeats the worker's sha-keyed base-document sharing — with the real
    // sha, iteration two is a refcount bump (~0.1ms), not a parse.
    const openIters = QUICK ? 16 : 60;
    results['open'] = [];
    for (const conc of CONC_LEVELS) {
      const r = await runLevel(pool, conc, openIters, async (i) => {
        const docId = `bench-cold-${conc}-${i}`;
        const key = `${PDF_SHA}-cold-${conc}-${i}`;
        const res = await pool.runOpen(docId, key, openBuild(docId, key));
        if (res.tag !== 'open') throw new Error(`unexpected ${res.tag}`);
        await pool.close(docId); // timed with the open: the class is one open+close cycle
        return pdfBytes.byteLength;
      });
      results['open'].push(r);
      printLevel('open', r);
    }

    // ---- kill-under-load (host only)
    if (pool instanceof EngineHostClient) {
      kill = await killUnderLoad(pool, docIds, pons);
      // eslint-disable-next-line no-console
      console.log(
        `kill-under-load: rejected=${kill.rejected} codes=${JSON.stringify(kill.errorCodes)} ` +
          `recovery=${kill.recoveryMs.toFixed(0)}ms eldMax=${kill.eldMaxMs.toFixed(1)}ms ` +
          `postRecoveryOk=${kill.postRecoveryOk}/5`,
      );
    }
  } finally {
    await pool.destroy();
  }

  // ---- end-to-end cold (separate app instance; informational)
  e2e = await endToEndCold(MODE, e2ePon);
  // eslint-disable-next-line no-console
  console.log(
    `e2e-cold (HTTP, off-lattice webp): n=${e2e.iters} c=${e2e.conc} p50=${e2e.p50.toFixed(1)}ms p95=${e2e.p95.toFixed(1)}ms meanBody=${mb(e2e.meanBytes)}`,
  );

  if (JSON_OUT) {
    await writeFile(
      JSON_OUT,
      JSON.stringify({ mode: MODE, poolSize: POOL_SIZE, results, kill, e2e }, null, 2),
    );
    // eslint-disable-next-line no-console
    console.log(`wrote ${JSON_OUT}`);
  }
}

main().then(
  () => process.exit(0),
  (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  },
);
