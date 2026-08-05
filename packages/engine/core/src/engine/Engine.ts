import type { DocumentHandle } from './DocumentHandle';
import type { FontService } from './FontService';
import type { OpenInput, OpenOptions } from '../dto/OpenInput';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Engine contract shared by `@embedpdf/engine` and
 * `@cloudpdf/engine`. Both implementations expose the same
 * `open()` surface and return the same {@link DocumentHandle} shape;
 * the only observable difference is transport — local goes through a
 * Worker + WASM PDFium, cloud goes through HTTPS to a remote server.
 *
 * Authorization parity:
 *   - Cloud reads scope + identity from the doc-scoped JWT it gets at
 *     transport setup time. `OpenOptions.scope` / `OpenOptions.identity`
 *     are silently ignored by cloud (the JWT is the authority).
 *   - Local reads scope + identity from `OpenOptions.scope` /
 *     `OpenOptions.identity` (no JWT involved). Defaults to `['*']`
 *     wildcard with a one-time console warning.
 *
 * Both engines run the same resolver against the same `pdf.permissions`
 * expansion → identical allow/deny decisions for the same
 * scope+identity+PDF-bits inputs. The parity test at
 * `engine-core/test/scope-parity.test.ts` (commit 17) locks this in.
 */
export interface Engine {
  open(input: OpenInput, options?: OpenOptions): AbortablePromise<DocumentHandle>;
  destroy(): AbortablePromise<void>;

  /**
   * Start booting the engine's backing resources (Worker spawn, WASM compile,
   * transport connect) without performing any work. Optional because some
   * engines have nothing to warm (cloud). Idempotent and non-blocking:
   * engines that boot lazily do so on first use anyway — calling `warmup()`
   * just overlaps that boot with app/plugin initialization instead of paying
   * for it on the first `open()`.
   */
  warmup?(): void;

  /**
   * Runtime font registration + fallback configuration. Present on the local
   * (WASM) engine only; `undefined` on the cloud engine, where fallback fonts
   * are a server-side policy decision and cannot be configured from the
   * client. See {@link FontService}.
   */
  readonly fonts?: FontService;
}

/**
 * A thunk that constructs a fresh {@link Engine}. Construction is synchronous
 * and cheap — engines allocate no live resources (no Worker, no WASM, no
 * socket) until first use — so the thunk exists purely to express OWNERSHIP:
 *
 *   - Pass an `Engine` INSTANCE to an adapter (`<Viewer>`, `provideEmbedPdf`)
 *     and it is BORROWED: the adapter never destroys it. You own the
 *     lifetime — the module-scope singleton case.
 *   - Pass a THUNK (`() => localEngine()`) and the adapter OWNS the result:
 *     it calls the thunk on mount and destroys the engine on unmount. Use
 *     this for per-mount isolation (StrictMode/HMR-clean teardown,
 *     multi-viewer independence).
 *
 * DELIBERATELY synchronous — an async thunk would reintroduce a "maybe
 * engine" that every consumer must await (the deferredEngine problem this
 * design removed). Async acquisition (dynamic `import()`, remote config)
 * belongs OUTSIDE the thunk: await it, then hand over the instance. Code
 * that genuinely needs a lazily-resolved engine models that itself with
 * `Engine | Promise<Engine>` (see the stamp plugin's `assetEngine`).
 */
export type EngineFactory = () => Engine;
