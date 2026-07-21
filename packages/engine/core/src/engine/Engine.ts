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
   * Runtime font registration + fallback configuration. Present on the local
   * (WASM) engine only; `undefined` on the cloud engine, where fallback fonts
   * are a server-side policy decision and cannot be configured from the
   * client. See {@link FontService}.
   */
  readonly fonts?: FontService;
}

/**
 * A *recipe* for an engine: an async factory that boots one and resolves it.
 *
 * This is the declarative half of the engine surface. `localEngine()` /
 * `cloudEngine()` return an {@link EngineFactory} — a description of how to
 * build an engine, carrying no live resources (no Worker, no WASM, no socket)
 * until it is called. That is what makes a recipe safe to evaluate at module
 * scope and on a server: nothing happens until someone cooks it.
 *
 * OWNERSHIP FOLLOWS ACQUISITION. Whoever calls the factory owns the engine it
 * returns and is responsible for `destroy()`. Two first-class consumers:
 *
 *   - An adapter (`<Viewer>`, `provideEmbedPdf`) hands a factory: the adapter
 *     calls it on mount and destroys the result on unmount. Viewer-owned.
 *   - A caller who wants to own the lifetime themselves (share one engine
 *     across viewers, keep it across route changes, pre-warm) wraps the recipe
 *     with {@link deferredEngine} to get a synchronously-usable, caller-owned
 *     {@link Engine} instance, then passes THAT to the adapter (borrowed —
 *     never destroyed by the adapter).
 */
export type EngineFactory = () => Promise<Engine>;
