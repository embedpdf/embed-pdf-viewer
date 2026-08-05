import { Worker } from 'node:worker_threads';
import { cpus } from 'node:os';
import {
  AbortError,
  EngineError,
  EngineErrorCode,
  deserializeError,
  wirePack,
  type WirePack,
  type WorkerJobId,
  type WorkerRequest,
  type WorkerResponse,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

let _nextJobId = 1;
function nextJobId(): WorkerJobId {
  return _nextJobId++;
}

interface WorkerSlot {
  index: number;
  worker: Worker;
  ready: Promise<void>;
  inFlight: Map<
    WorkerJobId,
    {
      resolve: (p: WorkerResultPayload) => void;
      reject: (e: unknown) => void;
      aborted: boolean;
      abortReason: unknown;
    }
  >;
  /** docIds currently bound to this worker. Used for sticky routing. */
  docIds: Set<string>;
  /**
   * Per-slot LRU of docId access. Re-bumped on every `run`/`runOpen`;
   * consulted by slot eviction when we must drop a doc to stay under
   * `maxDocsPerSlot`. Insertion-order Map = LRU.
   */
  lru: Map<string, number>;
  /**
   * Refcount of docs by their `base_sha`. Drives sticky-by-base_sha
   * routing: we prefer slots that already serve a given base, so the
   * OS page cache and any in-process structures (eg the worker-side
   * PDFium document handle for the same bytes) get reused.
   */
  baseShas: Map<string, number>;
  /** docId -> base_sha for the docs bound to this slot. */
  docToBaseSha: Map<string, string>;
}

/**
 * A deployment fallback font, registered on every worker thread at startup.
 * The pool passes these to each worker via `workerData`; the worker reads the
 * file and registers it through `WorkerHost.registerStartupFonts`. This is the
 * server-owned font policy — cloud clients cannot configure fonts.
 */
export interface FallbackFontDescriptor {
  /** Stable key. Also usable as a FreeText `fontFamily` if you expose it. */
  key: string;
  /** Absolute path to a TTF/OTF file, read by each worker at startup. */
  path: string;
  /** Base font name. Empty/omitted → inferred from the file. */
  familyName?: string;
  /** Style weight for matching. Omitted → inferred. */
  weight?: number;
  /** Italic flag for matching. Omitted → inferred. */
  italic?: boolean;
  /** Add to the glyph-fallback chain. Defaults to `true` (the server use case). */
  fallback?: boolean;
}

/** Shape passed to each worker via `workerData`. */
export interface WorkerBootstrapData {
  fonts: ReadonlyArray<FallbackFontDescriptor>;
}

export interface WorkerThreadPoolOptions {
  /**
   * Number of worker threads. Each worker runs an independent, thread-confined
   * PDFium runtime (the native lib is built with `embedpdf_thread_local_globals`
   * so per-thread globals never race), and docs are pinned to a worker via
   * sticky-by-docId routing — so N workers render in parallel in-process with
   * zero-copy `postMessage` transfer preserved.
   *
   * Resolution order: this explicit value, else the `CLOUDPDF_WORKER_POOL_SIZE`
   * env (an integer, or `max` for one worker per CPU), else a conservative
   * default of `min(2, cpus)`. Raise it (e.g. to
   * `cpus`) only after the TSAN + threaded-soak gate is green for the deployed
   * native build; see `testing/tools:epdf_thread_soak`.
   */
  size?: number;
  /**
   * Location of the worker_thread entry script. Required because Vite's
   * library-mode bundling places shared code in chunks at runtime, so a
   * relative `import.meta.url` lookup from this file is not stable. The
   * default is provided by the package entry (see src/index.ts).
   */
  workerEntry: URL | string;
  /**
   * Hard cap on the number of docs a single worker may serve before
   * it starts evicting its LRU doc. Without this, a single slot can
   * accumulate hundreds of bound docIds (per-doc PDFium handle +
   * worker-side state) and run out of memory. Defaults to a
   * generous 64; 0 disables eviction.
   */
  maxDocsPerSlot?: number;
  /**
   * Notified whenever the pool evicts a docId to stay under
   * `maxDocsPerSlot`. Lets the orchestrator (`DocumentService`)
   * invalidate any cached handles for the evicted doc so the next
   * request lazily re-opens.
   */
  onEvict?: (evt: { docId: string; baseSha: string; slot: number }) => void;
  /**
   * Deployment fallback fonts, registered on every worker thread at startup
   * (before it reports ready). A font that fails to load fails worker spawn —
   * a misconfigured font set is a boot error, not a silent degrade. Server-
   * owned: clients never configure fonts on the cloud engine.
   */
  fonts?: ReadonlyArray<FallbackFontDescriptor>;
}

/** Conservative default worker count until the thread-confined gate is validated. */
const DEFAULT_POOL_SIZE_CAP = 2;

/**
 * Resolve the worker-thread count. See `WorkerThreadPoolOptions.size` for the
 * contract and resolution order (explicit -> env -> conservative default).
 */
function resolvePoolSize(explicit: number | undefined): number {
  const cpuCount = Math.max(1, cpus().length);
  if (explicit !== undefined) {
    return Math.max(1, Math.floor(explicit));
  }
  const fromEnv = process.env.CLOUDPDF_WORKER_POOL_SIZE;
  if (fromEnv) {
    const trimmed = fromEnv.trim().toLowerCase();
    if (trimmed === 'max') {
      return cpuCount;
    }
    const parsed = Number.parseInt(trimmed, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return Math.min(DEFAULT_POOL_SIZE_CAP, cpuCount);
}

/**
 * worker_thread pool with two routing dimensions:
 *
 *   1. **Sticky-by-docId** — once a doc is opened on slot N, every
 *      subsequent `run(docId)` call is dispatched to slot N. The
 *      PDFium document handle lives on that worker, so we'd otherwise
 *      need to re-parse the PDF on every call.
 *
 *   2. **Sticky-by-base_sha** (Phase 3) — when opening a *new* doc,
 *      we prefer a slot that already serves a doc with the same
 *      `base_sha`. Reuses OS page cache + any worker-local caches
 *      keyed by the base bytes. The "same handbook across 1000
 *      employees" case lands on a handful of slots, not all of them.
 *
 * Slot eviction kicks in when a slot reaches `maxDocsPerSlot`: the
 * LRU doc on the slot is closed (worker is told to drop it) and the
 * bindings are released. The eviction callback lets the orchestrator
 * forget any cached handles.
 *
 * Cancellation: aborts during in-flight calls are best-effort; once
 * an abort fires the pool still rejects with AbortError when the
 * worker eventually replies.
 */
export class WorkerThreadPool {
  private readonly slots: WorkerSlot[] = [];
  private readonly docToSlot = new Map<string, number>();
  private readonly maxDocsPerSlot: number;
  private readonly onEvict:
    | ((evt: { docId: string; baseSha: string; slot: number }) => void)
    | undefined;
  private accessTick = 0;
  private destroyed = false;

  static async create(opts: WorkerThreadPoolOptions): Promise<WorkerThreadPool> {
    const pool = new WorkerThreadPool(opts);
    const size = resolvePoolSize(opts.size);
    const entry = opts.workerEntry;
    const bootstrap: WorkerBootstrapData = { fonts: opts.fonts ?? [] };

    for (let i = 0; i < size; i++) {
      // Each worker reads the font files itself and registers them on its own
      // thread-confined PDFium runtime — the registry is thread-local, so the
      // same list runs on every worker.
      const worker = new Worker(entry, { workerData: bootstrap });
      const slot: WorkerSlot = {
        index: i,
        worker,
        ready: waitForReady(worker),
        inFlight: new Map(),
        docIds: new Set(),
        lru: new Map(),
        baseShas: new Map(),
        docToBaseSha: new Map(),
      };
      worker.on(
        'message',
        (msg: WorkerResponse | { kind: 'ready' } | { kind: 'init-error'; error: string }) => {
          if (!msg || typeof msg !== 'object' || !('kind' in msg)) return;
          if (msg.kind === 'ready' || msg.kind === 'init-error') return;
          const handler = slot.inFlight.get(msg.jobId);
          if (!handler) return;
          slot.inFlight.delete(msg.jobId);
          if (handler.aborted) {
            handler.reject(new AbortError(handler.abortReason));
            return;
          }
          if (msg.kind === 'resolve') {
            handler.resolve(msg.result);
          } else {
            handler.reject(deserializeError(msg.error));
          }
        },
      );
      worker.on('error', (err) => {
        for (const handler of slot.inFlight.values()) handler.reject(err);
        slot.inFlight.clear();
      });
      pool.slots.push(slot);
    }
    await Promise.all(pool.slots.map((s) => s.ready));
    return pool;
  }

  private constructor(opts?: WorkerThreadPoolOptions) {
    this.maxDocsPerSlot = opts?.maxDocsPerSlot ?? 64;
    this.onEvict = opts?.onEvict;
  }

  /**
   * Open a new document. The slot is chosen via two-tier routing:
   *
   *   1. Sticky-by-base_sha: if `baseSha` is supplied and a slot
   *      already serves a doc with that base, pick the least-loaded
   *      among those slots.
   *   2. Otherwise: least-loaded slot overall (round-robin
   *      tiebreaker, lowest-index wins).
   *
   * The route is responsible for producing the `WirePack<OpenWorkerRequest>`
   * — typically `wirePack(openReq, [bytes.buffer])` — because the route
   * is the layer that already holds the `Buffer`/`Uint8Array` and knows
   * which `ArrayBuffer` slice should move zero-copy to the worker. The
   * pool no longer copies/slices the bytes; it just binds the docId to
   * a worker slot and dispatches the pre-packed request.
   *
   * Legacy callers that pass `runOpen(docId, build, signal)` (3 args)
   * still work — they default to the no-baseSha branch and routing
   * collapses to "least loaded overall".
   */
  async runOpen(
    docId: string,
    baseShaOrBuild: string | ((jobId: WorkerJobId) => WirePack<WorkerRequest>),
    buildOrSignal?: ((jobId: WorkerJobId) => WirePack<WorkerRequest>) | AbortSignal,
    maybeSignal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (this.destroyed) throw new EngineError(EngineErrorCode.RuntimeUnavailable, 'pool destroyed');
    let baseSha: string | undefined;
    let build: (jobId: WorkerJobId) => WirePack<WorkerRequest>;
    let signal: AbortSignal | undefined;
    if (typeof baseShaOrBuild === 'string') {
      baseSha = baseShaOrBuild;
      build = buildOrSignal as (jobId: WorkerJobId) => WirePack<WorkerRequest>;
      signal = maybeSignal;
    } else {
      build = baseShaOrBuild;
      signal = buildOrSignal as AbortSignal | undefined;
    }
    if (this.docToSlot.has(docId)) {
      throw new EngineError(EngineErrorCode.InvalidArg, `docId already open: ${docId}`);
    }
    const slot = baseSha ? this.pickSlotForBase(baseSha) : this.pickLeastLoaded();
    // Capacity check BEFORE binding the new doc — eviction may close
    // a doc on this slot, which we want to settle before the new
    // openassignment lands.
    if (this.maxDocsPerSlot > 0 && slot.docIds.size >= this.maxDocsPerSlot) {
      await this.evictLruOn(slot);
    }
    slot.docIds.add(docId);
    slot.lru.set(docId, ++this.accessTick);
    this.docToSlot.set(docId, slot.index);
    if (baseSha) {
      slot.baseShas.set(baseSha, (slot.baseShas.get(baseSha) ?? 0) + 1);
      slot.docToBaseSha.set(docId, baseSha);
    }
    try {
      return await this.dispatchToSlot(slot, build, signal);
    } catch (err) {
      this.releaseBinding(slot, docId);
      throw err;
    }
  }

  /** Run a sticky call against the worker that owns the docId. */
  async run(
    docId: string,
    build: (jobId: WorkerJobId) => WirePack<WorkerRequest>,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (this.destroyed) throw new EngineError(EngineErrorCode.RuntimeUnavailable, 'pool destroyed');
    const idx = this.docToSlot.get(docId);
    if (idx === undefined) {
      throw new EngineError(EngineErrorCode.DocNotOpen, `document not open: ${docId}`);
    }
    const slot = this.slots[idx]!;
    slot.lru.set(docId, ++this.accessTick);
    return this.dispatchToSlot(slot, build, signal);
  }

  /**
   * Run a one-shot worker job that does not open or bind a document
   * session. Used for ingestion probes where PDFium should still live
   * behind the worker boundary, but the request must not consume a
   * long-lived doc slot.
   */
  async runAdHoc(
    baseSha: string | undefined,
    build: (jobId: WorkerJobId) => WirePack<WorkerRequest>,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    if (this.destroyed) throw new EngineError(EngineErrorCode.RuntimeUnavailable, 'pool destroyed');
    const slot = baseSha ? this.pickSlotForBase(baseSha) : this.pickLeastLoaded();
    return this.dispatchToSlot(slot, build, signal);
  }

  /** Close the document and release the sticky binding. */
  async close(docId: string, signal?: AbortSignal): Promise<WorkerResultPayload | null> {
    if (this.destroyed) return null;
    const idx = this.docToSlot.get(docId);
    if (idx === undefined) return null;
    const slot = this.slots[idx]!;
    try {
      const r = await this.dispatchToSlot(
        slot,
        // close carries no buffers — pack with the shared empty transfer.
        (jobId) => wirePack({ kind: 'close', jobId, docId }),
        signal,
      );
      return r;
    } finally {
      this.releaseBinding(slot, docId);
    }
  }

  /**
   * Diagnostic snapshot for tests + production introspection. Reveals
   * which docIds and base_shas each slot serves; routes never depend
   * on this shape.
   */
  inspect(): Array<{ slot: number; docIds: string[]; baseShas: string[] }> {
    return this.slots.map((s) => ({
      slot: s.index,
      docIds: [...s.docIds],
      baseShas: [...s.baseShas.keys()],
    }));
  }

  private releaseBinding(slot: WorkerSlot, docId: string): void {
    slot.docIds.delete(docId);
    slot.lru.delete(docId);
    const baseSha = slot.docToBaseSha.get(docId);
    if (baseSha) {
      const next = (slot.baseShas.get(baseSha) ?? 1) - 1;
      if (next <= 0) slot.baseShas.delete(baseSha);
      else slot.baseShas.set(baseSha, next);
      slot.docToBaseSha.delete(docId);
    }
    this.docToSlot.delete(docId);
  }

  /**
   * Send a close request to the worker for the LRU doc on `slot` and
   * release its bindings. The user-facing `onEvict` hook fires after
   * the worker confirms the close so orchestrators can drop their
   * cached handles in lockstep.
   */
  private async evictLruOn(slot: WorkerSlot): Promise<void> {
    let oldest: { docId: string; tick: number } | null = null;
    for (const [docId, tick] of slot.lru) {
      if (!oldest || tick < oldest.tick) oldest = { docId, tick };
    }
    if (!oldest) return;
    const evicted = oldest.docId;
    const baseSha = slot.docToBaseSha.get(evicted) ?? '';
    try {
      await this.dispatchToSlot(slot, (jobId) =>
        wirePack({ kind: 'close', jobId, docId: evicted }),
      );
    } catch {
      // Worker-side close errors are best-effort during eviction; we
      // still release local bindings so the slot can accept the new
      // open. A future `run(evicted)` would correctly DocNotOpen.
    }
    this.releaseBinding(slot, evicted);
    this.onEvict?.({ docId: evicted, baseSha, slot: slot.index });
  }

  private pickSlotForBase(baseSha: string): WorkerSlot {
    // Tier 1: any slot already serving this base. Pick the least
    // loaded among them; this distributes the M-employees case
    // across the affinity set.
    const affinitySet = this.slots.filter((s) => s.baseShas.has(baseSha));
    if (affinitySet.length > 0) {
      let best = affinitySet[0]!;
      for (const s of affinitySet) if (s.docIds.size < best.docIds.size) best = s;
      return best;
    }
    // Tier 2: no slot has this base yet — fall back to overall
    // least-loaded so we spread the materialisation cost evenly.
    return this.pickLeastLoaded();
  }

  async destroy(): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;

    for (const slot of this.slots) {
      const jobId = nextJobId();
      try {
        await new Promise<void>((resolve) => {
          const onMsg = (msg: WorkerResponse) => {
            if (msg && typeof msg === 'object' && 'jobId' in msg && msg.jobId === jobId) {
              slot.worker.off('message', onMsg);
              resolve();
            }
          };
          slot.worker.on('message', onMsg);
          slot.worker.postMessage({ kind: 'shutdown', jobId } as WorkerRequest);
          setTimeout(() => {
            slot.worker.off('message', onMsg);
            resolve();
          }, 250);
        });
      } catch {
        // ignore
      }
      try {
        await slot.worker.terminate();
      } catch {
        // ignore
      }
    }
  }

  private pickLeastLoaded(): WorkerSlot {
    let best = this.slots[0]!;
    for (const s of this.slots) {
      if (s.docIds.size < best.docIds.size) best = s;
    }
    return best;
  }

  private dispatchToSlot(
    slot: WorkerSlot,
    build: (jobId: WorkerJobId) => WirePack<WorkerRequest>,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload> {
    const jobId = nextJobId();
    const pack = build(jobId);
    return new Promise<WorkerResultPayload>((resolve, reject) => {
      const handler = { resolve, reject, aborted: false, abortReason: undefined as unknown };
      slot.inFlight.set(jobId, handler);

      const onAbort = () => {
        handler.aborted = true;
        handler.abortReason = signal?.reason;
        try {
          slot.worker.postMessage({ kind: 'abort', jobId } as WorkerRequest);
        } catch {
          // ignore
        }
      };
      if (signal) {
        if (signal.aborted) {
          onAbort();
        } else {
          signal.addEventListener('abort', onAbort, { once: true });
        }
      }

      try {
        // `pack.transfer` is the producer's authoritative manifest. We
        // narrow to `readonly ArrayBuffer[]` at the boundary because
        // Node's `worker_threads.postMessage` typing accepts a transfer
        // list of `ArrayBuffer | MessagePort`, and ArrayBuffer is the
        // only kind we currently move across this seam.
        slot.worker.postMessage(pack.payload, pack.transfer as readonly ArrayBuffer[]);
      } catch (err) {
        slot.inFlight.delete(jobId);
        reject(err);
      }
    });
  }
}

function waitForReady(worker: Worker): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const onMsg = (msg: { kind?: string; error?: string }) => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.kind === 'ready') {
        worker.off('message', onMsg);
        resolve();
      } else if (msg.kind === 'init-error') {
        worker.off('message', onMsg);
        reject(new Error(`worker failed to initialize: ${msg.error}`));
      }
    };
    worker.on('message', onMsg);
    worker.once('error', reject);
  });
}
