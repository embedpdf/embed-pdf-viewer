import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';
import type {
  WirePack,
  WorkerJobId,
  WorkerRequest,
  WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

export type BuildPack = (jobId: WorkerJobId) => WirePack<WorkerRequest>;

/**
 * Dispatch metadata for ad-hoc work. `lane: 'background'` marks
 * known-DISPOSABLE work (today: exactly the thumbnail warm) for the C1
 * scheduler's capped lane; everything else — including the ingestion
 * security probe, which a user's commit waits on — defaults to
 * interactive. Base pools ignore it; only `SchedulingEnginePool` reads it.
 */
export interface RunAdHocOptions {
  lane?: 'background';
}

/**
 * The engine plane's entire surface. `WorkerThreadPool` (inline mode —
 * worker threads in this process) and `EngineHostClient` (host mode — a
 * supervised child process) both implement it; every service and route
 * depends only on this. Extraction, not design: the shape is exactly
 * what the pool exposed before host mode existed.
 */
export interface EnginePool {
  runOpen(
    docId: string,
    baseSha: string,
    build: BuildPack,
    signal?: AbortSignal,
  ): Promise<WorkerResultPayload>;
  runOpen(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload>;
  run(docId: string, build: BuildPack, signal?: AbortSignal): Promise<WorkerResultPayload>;
  runAdHoc(
    baseSha: string | undefined,
    build: BuildPack,
    signal?: AbortSignal,
    opts?: RunAdHocOptions,
  ): Promise<WorkerResultPayload>;
  close(docId: string, signal?: AbortSignal): Promise<WorkerResultPayload | null>;
  destroy(): Promise<void>;
  inspect(): Array<{ slot: number; docIds: string[]; baseShas: string[] }>;
  stats(): { slots: number; docs: number; inFlight: number };
  /**
   * Monotonic engine generation: bumps on every engine (re)spawn. The
   * WS1 write pipeline captures it at write-alignment time and refuses
   * to bless a session created under a LATER generation (see
   * `DocumentService.advanceLayerSession`). Inline pool: constant 0 —
   * the fence is vacuously satisfied and pre-host semantics are
   * untouched.
   */
  generation(): number;
  /**
   * The generation of THE SHARD SERVING THIS DOCUMENT — what the WS1
   * write fence captures and re-checks (both fence sites use only this).
   * Single-engine pools ignore docId; the sharded composite returns the
   * resident shard's generation, or -1 when the doc is not resident (a
   * value no real generation takes, so a bless-time compare always
   * refuses when the doc's shard died in the window). `generation()`
   * stays as the max-across-shards diagnostics number.
   */
  generationFor(docId: string): number;
  /**
   * Readiness detail for `/readyz`. Inline: always ready. Host mode:
   * `starting`/`backoff` with how long the engine has been unavailable —
   * readiness only fails past a persistence threshold so a sub-second
   * respawn never flaps the pod out of its load balancer.
   */
  health(): { state: 'ready' | 'starting' | 'backoff'; downSinceMs: number | null };
}

/**
 * One-shot `DocNotOpen` recovery for READ dispatches. A read that PARKED
 * across an engine respawn (crash or planned recycle) dispatches into a
 * successor that no longer holds the document — the pre-dispatch ensure
 * ran against the old world. Re-ensure (the restart hook already cleared
 * the service caches, so this genuinely reopens) and retry ONCE.
 * Mutations never use this: their retry story is WS1's fence + rebase.
 */
export async function runReadWithReopen(
  reensure: () => Promise<unknown>,
  dispatch: () => Promise<WorkerResultPayload>,
): Promise<WorkerResultPayload> {
  try {
    return await dispatch();
  } catch (err) {
    if (!(err instanceof EngineError && err.code === EngineErrorCode.DocNotOpen)) throw err;
    await reensure();
    return dispatch();
  }
}
