import type {
  WirePack,
  WorkerJobId,
  WorkerRequest,
  WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';

export type BuildPack = (jobId: WorkerJobId) => WirePack<WorkerRequest>;

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
   * Readiness detail for `/readyz`. Inline: always ready. Host mode:
   * `starting`/`backoff` with how long the engine has been unavailable —
   * readiness only fails past a persistence threshold so a sub-second
   * respawn never flaps the pod out of its load balancer.
   */
  health(): { state: 'ready' | 'starting' | 'backoff'; downSinceMs: number | null };
}
