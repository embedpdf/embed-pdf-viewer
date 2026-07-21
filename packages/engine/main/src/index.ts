/**
 * @embedpdf/engine - Engine v3 local implementation.
 *
 * Public API:
 *   localEngine(options?)               -> LocalEngine (Web Worker; boots lazily on first use)
 *   createLocalEngine()                 -> LocalEngine using inline transport (Node, tests)
 *   createLocalEngineWithWorker(worker) -> LocalEngine using a caller-supplied Web Worker
 *
 * All three construct SYNCHRONOUSLY and allocate nothing until the first
 * operation (or `engine.warmup()`): readiness lives inside {@link LazyTransport},
 * so no caller ever awaits engine construction.
 */
import {
  deserializeError,
  wirePack,
  type FontSpec,
  type WirePack,
  type WorkerRequest,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';
import { createPdfRuntime, type CreatePdfRuntimeOptions } from '@embedpdf/engine-runtime';

import { LocalEngine, type LocalEngineOptions } from './LocalEngine';
import type { LocalFontService } from './fonts/LocalFontService';
import { BrowserWorkerTransport, watchWorkerReady } from './transport/BrowserWorkerTransport';
import { InlineTransport } from './transport/InlineTransport';
import { LazyTransport, type LazyTransportOptions } from './transport/LazyTransport';
import type { Transport } from './transport/Transport';
import { nextJobId } from './worker/jobIds';
import type { JobId } from './worker/protocol';
import type { LocalImageEncoder } from './render/BrowserImageEncoder';

export type { EngineFactory } from '@embedpdf/engine-core/runtime';
export { LocalEngine } from './LocalEngine';
export type { LocalEngineOptions } from './LocalEngine';
export type { Transport } from './transport/Transport';
export { InlineTransport } from './transport/InlineTransport';
export { BrowserWorkerTransport } from './transport/BrowserWorkerTransport';
export { LazyTransport } from './transport/LazyTransport';
export { Priority } from './worker/Priority';
export type { WorkerRequest, WorkerResponse } from './worker/protocol';
export { LocalDocumentHandle } from './document/LocalDocumentHandle';
export { LocalDocumentAnnotationsService } from './document/LocalDocumentAnnotationsService';
export { LocalDocumentPagesService } from './document/LocalDocumentPagesService';
export { LocalPageHandle } from './document/LocalPageHandle';
export { LocalPageAnnotationsService } from './document/LocalPageAnnotationsService';
export { LocalPageGeometryService } from './document/LocalPageGeometryService';
export { LocalPageRenderService } from './document/LocalPageRenderService';
export { BrowserImageEncoder } from './render/BrowserImageEncoder';
export type { LocalImageEncoder } from './render/BrowserImageEncoder';
export { LocalFontService } from './fonts/LocalFontService';

export interface CreateLocalEngineOptions extends Omit<LocalEngineOptions, 'transport'> {
  /** Forwarded to @embedpdf/engine-runtime when the runtime is created. */
  runtime?: CreatePdfRuntimeOptions;
}

/**
 * Create a LocalEngine that runs PDFium inline in the current thread.
 * Suitable for Node, tests, and as a worker-less browser fallback.
 *
 * Synchronous: the runtime (WASM compile / native load) boots lazily on the
 * first operation, inside the engine's {@link LazyTransport}.
 */
export function createLocalEngine(opts: CreateLocalEngineOptions = {}): LocalEngine {
  const transport = new LazyTransport(
    async () => new InlineTransport(await createPdfRuntime(opts.runtime ?? {})),
  );
  return LocalEngine.fromTransport({
    transport,
    concurrency: opts.concurrency,
    imageEncoder: opts.imageEncoder,
  });
}

export interface CreateLocalEngineWithWorkerOptions extends Omit<LocalEngineOptions, 'transport'> {
  worker: Worker | (() => Worker);
}

/**
 * Create a LocalEngine that talks to a caller-supplied Web Worker. The worker
 * must be wired up to engine-local's worker-entry (see src/worker/worker-entry.ts).
 *
 * Synchronous. Pass a `() => Worker` thunk to defer even the Worker allocation
 * until the engine first boots (first operation or `warmup()`); passing a live
 * `Worker` is also fine — its init handshake is latched immediately (see
 * {@link watchWorkerReady}) so a worker that finishes booting before the first
 * engine operation cannot hang the lazy boot.
 */
export function createLocalEngineWithWorker(opts: CreateLocalEngineWithWorkerOptions): LocalEngine {
  const boot = workerBoot(opts.worker);
  const transport = new LazyTransport(boot.spawn, boot.lazyOptions);
  return LocalEngine.fromTransport({
    transport,
    concurrency: opts.concurrency,
    imageEncoder: opts.imageEncoder,
  });
}

/**
 * Resolve a `worker` option into a boot-time transport factory plus
 * LazyTransport options — the one place the live-Worker vs thunk asymmetry is
 * handled:
 *
 *   - LIVE `Worker`: it began initializing at `new Worker()`, and its
 *     `ready`/`init-error` message is dropped if nothing is listening when it
 *     fires. So the handshake is latched HERE, synchronously at engine
 *     construction, and the latch is what the deferred spawn awaits. The
 *     abandon hook terminates the worker if the engine is destroyed without
 *     ever booting (the boot factory never ran, so nobody else would).
 *   - Thunk / default: nothing exists until boot, so nothing can race and
 *     nothing needs reclaiming.
 */
function workerBoot(worker: Worker | (() => Worker) | undefined): {
  spawn: () => Promise<Transport>;
  lazyOptions: LazyTransportOptions;
} {
  if (worker !== undefined && typeof worker !== 'function') {
    const ready = watchWorkerReady(worker);
    // A dormant engine must not surface an unhandled rejection if the worker
    // init-errors before anything boots; spawn() re-awaits the original.
    void ready.catch(() => {});
    return {
      spawn: () => BrowserWorkerTransport.spawn(worker, ready),
      lazyOptions: { onAbandon: () => worker.terminate() },
    };
  }
  return {
    spawn: () => BrowserWorkerTransport.spawn(worker ? worker() : spawnDefaultWorker()),
    lazyOptions: {},
  };
}

/**
 * Spawn the default engine worker (`dist/default-worker.js`) with the
 * web-standard, bundler-portable pattern. Vite, webpack 5 / Next, Rollup, and
 * Parcel all statically discover this form and emit the worker with zero
 * consumer configuration.
 *
 * Exported for the rare case of composing your own worker lifecycle; most apps
 * never call it — `localEngine()` does it for them.
 */
export function spawnDefaultWorker(): Worker {
  return new Worker(new URL('./default-worker.js', import.meta.url), { type: 'module' });
}

/**
 * A font to load at engine boot. Either carry the bytes directly (`data`) or
 * point at a URL fetched during boot (`url`) — exactly one is required.
 */
export interface RecipeFontSpec {
  /** Caller-chosen stable key, unique within the engine (see {@link FontSpec}). */
  key: string;
  /** Base font name used in the PDF and for fallback matching; inferred when omitted. */
  familyName?: string;
  /** Style weight (100–900) for fallback matching; inferred when omitted. */
  weight?: number;
  /** Italic flag for fallback matching; inferred when omitted. */
  italic?: boolean;
  /** Font file bytes (TTF/OTF). Mutually exclusive with `url`. */
  data?: Uint8Array | ArrayBuffer;
  /** URL fetched (once) during boot to obtain the bytes. Mutually exclusive with `data`. */
  url?: string;
}

export interface LocalEngineRecipeOptions {
  /**
   * The worker backing the engine. Omit for the default portable worker
   * ({@link spawnDefaultWorker}). Pass a `() => Worker` thunk (called once at
   * boot) for a custom setup — CSP nonces, a bundler without `new URL` worker
   * support, a shared worker, ... A live `Worker` also works, but the thunk
   * form keeps construction fully allocation-free.
   */
  worker?: Worker | (() => Worker);
  /**
   * Fonts registered AND appended to the ordered glyph-fallback chain, in
   * order — the ones used to substitute missing glyphs during rendering and
   * appearance generation (e.g. a CJK fallback). This is the common case.
   */
  fallbackFonts?: RecipeFontSpec[];
  /**
   * Fonts registered but NOT added to the fallback chain — available for
   * explicit annotation authoring (a FreeText `fontFamily`) without affecting
   * automatic substitution.
   */
  fonts?: RecipeFontSpec[];
  /** WorkerQueue concurrency (default 1). */
  concurrency?: number;
  /** Custom raster encoder (thumbnails / image export). */
  imageEncoder?: LocalImageEncoder;
}

/**
 * Create a local (PDFium-in-a-Worker) {@link LocalEngine}.
 *
 * SYNCHRONOUS AND CHEAP: the returned object is a fully usable {@link Engine},
 * but it allocates nothing — no Worker, no WASM — until the first operation
 * (or an explicit `engine.warmup()`). That makes it safe to create at module
 * scope, including on a server (Next/Nuxt SSR): nothing browser-specific runs
 * until someone actually opens a document in the browser.
 *
 * Configured fonts are guaranteed to be registered on the worker before any
 * other work runs: the boot pipeline fetches font URLs in parallel with the
 * worker spawn, registers everything, and only then releases queued jobs.
 * Dynamic registration later via `engine.fonts.register()` also just works.
 *
 * Ownership: the engine is yours — call `engine.destroy()` when you are done
 * (for a module-scope singleton backing your whole app, that is usually
 * never). To let a `<Viewer>` own the lifetime instead, pass a thunk:
 * `engine={() => localEngine()}` — the viewer creates it on mount and
 * destroys it on unmount.
 *
 * ```ts
 * const engine = localEngine({
 *   fallbackFonts: [{ key: 'noto-cjk', url: '/fonts/NotoSansCJK.ttf' }],
 * });
 * <Viewer engine={engine} plugins={[stagePlugin(), renderPlugin()]} />
 * ```
 */
export function localEngine(options: LocalEngineRecipeOptions = {}): LocalEngine {
  const boot = workerBoot(options.worker);
  const transport = new LazyTransport(async () => {
    // Spawn and font fetches run in parallel; nothing queued by the caller can
    // reach the worker until this factory resolves.
    const [spawned, resolvedFonts] = await Promise.allSettled([
      boot.spawn(),
      resolveRecipeFonts(options),
    ]);
    if (spawned.status === 'rejected') {
      throw spawned.reason;
    }
    const inner = spawned.value;
    try {
      if (resolvedFonts.status === 'rejected') throw resolvedFonts.reason;
      await registerBootFonts(inner, engine.fonts, resolvedFonts.value);
      return inner;
    } catch (error) {
      // A half-configured engine must not leak its worker: tear it down before
      // surfacing the boot failure.
      await inner.terminate().catch(() => {});
      throw error;
    }
  }, boot.lazyOptions);
  const engine: LocalEngine = LocalEngine.fromTransport({
    transport,
    concurrency: options.concurrency,
    imageEncoder: options.imageEncoder,
  });
  return engine;
}

interface ResolvedRecipeFont {
  spec: FontSpec;
  fallback: boolean;
}

/** Resolve every configured font's bytes (fetching `url` entries) in declared
 *  order: plain fonts first, then fallback fonts — fallback precedence is
 *  registration order (first font covering a missing glyph wins). */
async function resolveRecipeFonts(
  options: LocalEngineRecipeOptions,
): Promise<ResolvedRecipeFont[]> {
  const entries: { raw: RecipeFontSpec; fallback: boolean }[] = [
    ...(options.fonts ?? []).map((raw) => ({ raw, fallback: false })),
    ...(options.fallbackFonts ?? []).map((raw) => ({ raw, fallback: true })),
  ];
  return Promise.all(
    entries.map(async ({ raw, fallback }) => ({ spec: await toFontSpec(raw), fallback })),
  );
}

/**
 * Register boot-config fonts by RAW transport send, bypassing the WorkerQueue.
 *
 * The bypass is load-bearing, not an optimization: during boot the queue's
 * concurrency slot may already be held by a buffered user `open()`, so a
 * queued font job could never dispatch — and the ordering guarantee ("fonts
 * before any user job") requires these packs to hit the worker while user
 * packs are still buffered in the LazyTransport. The main-thread FontService
 * registry is seeded afterwards so `list()` / idempotent `register()` /
 * `replay()` stay consistent.
 */
async function registerBootFonts(
  transport: Transport,
  fontService: LocalFontService,
  fonts: ResolvedRecipeFont[],
): Promise<void> {
  for (const { spec, fallback } of fonts) {
    // Seed BEFORE the raw send: seeding copies the bytes, and the wire buffer
    // is transferred (neutered) by the worker transport.
    fontService.seedRegistered(spec, { fallback });
    const bytes = toStandaloneArrayBuffer(spec.data);
    await requestOverTransport(transport, (jobId) =>
      wirePack(
        {
          kind: 'fonts.register',
          jobId,
          fontKey: spec.key,
          familyName: spec.familyName ?? '',
          weight: spec.weight ?? 0,
          italic: spec.italic === undefined ? -1 : spec.italic ? 1 : 0,
          data: bytes,
        },
        [bytes],
      ),
    );
    if (fallback) {
      await requestOverTransport(transport, (jobId) =>
        wirePack({ kind: 'fonts.addFallback', jobId, fontKey: spec.key }),
      );
    }
  }
}

/** One raw request/response round-trip over a live transport (the same
 *  settle-listener pattern WorkerQueue.shutdown uses). */
function requestOverTransport(
  transport: Transport,
  buildPack: (jobId: JobId) => WirePack<WorkerRequest>,
): Promise<WorkerResultPayload> {
  const jobId = nextJobId();
  return new Promise<WorkerResultPayload>((resolve, reject) => {
    const off = transport.onMessage((msg) => {
      if (msg.jobId !== jobId) return;
      off();
      if (msg.kind === 'resolve') resolve(msg.result);
      else reject(deserializeError(msg.error));
    });
    transport.send(buildPack(jobId));
  });
}

async function toFontSpec(spec: RecipeFontSpec): Promise<FontSpec> {
  if ((spec.data == null) === (spec.url == null)) {
    throw new Error(
      `[embedpdf] localEngine: font "${spec.key}" must set exactly one of \`data\` or \`url\``,
    );
  }
  const data = spec.data ?? (await fetchFontBytes(spec.url!));
  return {
    key: spec.key,
    familyName: spec.familyName,
    weight: spec.weight,
    italic: spec.italic,
    data,
  };
}

async function fetchFontBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`[embedpdf] localEngine: failed to fetch font ${url}: ${response.status}`);
  }
  return new Uint8Array(await response.arrayBuffer());
}

function toStandaloneArrayBuffer(input: Uint8Array | ArrayBuffer): ArrayBuffer {
  if (input instanceof ArrayBuffer) return input.slice(0);
  const copy = new ArrayBuffer(input.byteLength);
  new Uint8Array(copy).set(input);
  return copy;
}
