/**
 * @embedpdf/engine - the local engine implementation.
 *
 * Public API:
 *   localEngine(options?)               -> LocalEngine (Web Worker; boots lazily on first use)
 *   createLocalEngine()                 -> LocalEngine using inline transport (Node, tests)
 *   createLocalEngineWithWorker(worker) -> LocalEngine using a caller-supplied Web Worker
 *
 * All three construct synchronously and allocate nothing until the first
 * operation (or `engine.warmup()`): readiness lives inside {@link LazyTransport},
 * so no caller ever awaits engine construction.
 */
import {
  deserializeError,
  wirePack,
  type EngineRenderPolicy,
  type FontSpec,
  type WirePack,
  type WorkerRequest,
  type WorkerResultPayload,
} from '@embedpdf/engine-core/runtime';
import { createPdfRuntime, type CreatePdfRuntimeOptions } from '@embedpdf/engine-runtime';

import type { LocalFontService } from './fonts/LocalFontService';
import { LocalEngine, type LocalEngineOptions } from './LocalEngine';
import {
  BrowserImageEncoder,
  type EncoderWorkerSource,
  type LocalImageEncoder,
} from './render/BrowserImageEncoder';
import { BrowserWorkerTransport, watchWorkerReady } from './transport/BrowserWorkerTransport';
import { InlineTransport } from './transport/InlineTransport';
import { LazyTransport, type LazyTransportOptions } from './transport/LazyTransport';
import type { Transport } from './transport/Transport';
import { allowWorkerUrl, createWorkerBlobUrl, startWorker } from './trusted-types';
import {
  resolveDefaultWasmSource,
  resolveWasmSource,
  resolveWasmSourceAsync,
  toAbsoluteUrl,
  type ResolvedWasmSource,
  type WasmSourceOptions,
  type WorkerSource,
} from './wasm-source';
import type { EngineWorkerInit } from './worker/bootstrap';
import { nextJobId } from './worker/jobIds';
import type { JobId } from './worker/protocol';
import { findEngineWorkerFile } from './worker-files';

// The developer-facing surface both engine packages share (errors, refs,
// helpers, the document types), from one list in engine-core, so code names
// everything from `@embedpdf/engine` exactly as it would from
// `@cloudpdf/engine`.
export * from '@embedpdf/engine-core/public';
export { LocalEngine } from './LocalEngine';
export type { LocalEngineOptions } from './LocalEngine';
export type { Transport } from './transport/Transport';
export { InlineTransport } from './transport/InlineTransport';
export { BrowserWorkerTransport } from './transport/BrowserWorkerTransport';
export { LazyTransport } from './transport/LazyTransport';
export type { WorkerRequest, WorkerResponse } from './worker/protocol';
export type { EngineWorkerInit } from './worker/bootstrap';
export { LocalDocumentAnnotationsService } from './document/LocalDocumentAnnotationsService';
export { LocalDocumentPagesService } from './document/LocalDocumentPagesService';
export { BrowserImageEncoder } from './render/BrowserImageEncoder';
export { PortableImageEncoder, encodePng } from './render/PortableImageEncoder';
export type {
  BrowserImageEncoderOptions,
  EncoderWorkerSource,
  LocalImageEncoder,
} from './render/BrowserImageEncoder';
export { LocalFontService } from './fonts/LocalFontService';
export { resolveWasmSource, resolveWasmSourceAsync, resolveDefaultWasmSource } from './wasm-source';
export type { ResolvedWasmSource, WasmSourceOptions, WorkerSource } from './wasm-source';

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
    renderPolicy: opts.renderPolicy,
    signedDocumentPolicy: opts.signedDocumentPolicy,
  });
}

export interface CreateLocalEngineWithWorkerOptions
  extends Omit<LocalEngineOptions, 'transport'>, WasmSourceOptions {
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
  const boot = workerBoot(opts.worker, opts);
  const transport = new LazyTransport(boot.spawn, boot.lazyOptions);
  return LocalEngine.fromTransport({
    transport,
    concurrency: opts.concurrency,
    imageEncoder: opts.imageEncoder,
    renderPolicy: opts.renderPolicy,
    signedDocumentPolicy: opts.signedDocumentPolicy,
  });
}

/**
 * Resolve a `worker` option into a boot-time transport factory plus
 * LazyTransport options — the one place the delivery asymmetries are handled:
 *
 *   - live `Worker`: it began initializing at `new Worker()`, and its
 *     `ready`/`init-error` message is dropped if nothing is listening when it
 *     fires. So the init message is posted and the handshake latched here,
 *     synchronously at engine construction, and the latch is what the
 *     deferred spawn awaits. The abandon hook terminates the worker if the
 *     engine is destroyed without ever booting (the boot factory never ran,
 *     so nobody else would).
 *   - Thunk / URL / the bundled file / `'inline'`: nothing exists until boot,
 *     so nothing can race and nothing needs reclaiming.
 *
 * The wasm source rides the same decision: the default and `'inline'`
 * deliveries (a bundler-renamed file or a blob, neither with the wasm beside
 * it) receive the default, the sibling the consumer's bundler emitted, and
 * nothing after it (see resolveDefaultWasmSource); a configured URL or a
 * caller-built worker self-resolves `embedpdf.wasm` as a sibling of the worker
 * script when no explicit source is configured.
 */
function workerBoot(
  delivery: WorkerSource | undefined,
  wasmOptions: WasmSourceOptions,
): {
  spawn: () => Promise<Transport>;
  lazyOptions: LazyTransportOptions;
} {
  // A live Worker is the only object-typed delivery (duck-typed rather than
  // `instanceof Worker` so non-DOM environments and test doubles work).
  if (typeof delivery === 'object' && delivery !== null) {
    // A live worker is posted its init synchronously (the caller may already
    // have posted work); a lazy `wasmLoader` is the one source that cannot be
    // — it boots through spawn() like the other deliveries.
    if (
      wasmOptions.wasmLoader &&
      !resolveWasmSource(wasmOptions).wasmUrl &&
      !wasmOptions.wasmBinary
    ) {
      const ready = resolveWasmSourceAsync(wasmOptions).then((wasm) => {
        postWorkerInit(delivery, wasm);
        return watchWorkerReady(delivery);
      });
      void ready.catch(() => {});
      return {
        spawn: () => BrowserWorkerTransport.spawn(delivery, ready),
        lazyOptions: { onAbandon: () => delivery.terminate() },
      };
    }
    postWorkerInit(delivery, resolveWasmSource(wasmOptions));
    const ready = watchWorkerReady(delivery);
    // A dormant engine must not surface an unhandled rejection if the worker
    // init-errors before anything boots; spawn() re-awaits the original.
    void ready.catch(() => {});
    return {
      spawn: () => BrowserWorkerTransport.spawn(delivery, ready),
      lazyOptions: { onAbandon: () => delivery.terminate() },
    };
  }

  // A configured URL is allowed now, as the embedder gave it: the one place it is decided.
  const configuredUrl =
    typeof delivery === 'string' && delivery !== 'inline' ? toAbsoluteUrl(delivery) : null;
  if (configuredUrl !== null) allowWorkerUrl(configuredUrl);

  return {
    spawn: async () => {
      // Resolve before spawning: if the sibling-url module can't load, no
      // worker is left orphaned. No extra tick for explicit sources: a
      // thunk/URL source resolves synchronously; only a lazy `wasmLoader`
      // awaits its bytes.
      const wasm =
        delivery === undefined || delivery === 'inline'
          ? await resolveDefaultWasmSource(wasmOptions)
          : wasmOptions.wasmLoader
            ? await resolveWasmSourceAsync(wasmOptions)
            : resolveWasmSource(wasmOptions);
      const spawned = await createEngineWorker(delivery, configuredUrl);
      postWorkerInit(spawned.worker, wasm);
      try {
        const transport = await BrowserWorkerTransport.spawn(spawned.worker);
        spawned.dispose();
        return transport;
      } catch (error) {
        spawned.dispose();
        spawned.worker.terminate();
        if (spawned.file === null) throw error;
        throw new Error(
          `[embedpdf] the engine worker did not start from ${spawned.file}, where your bundler ` +
            "was to put @embedpdf/engine's workers/embedpdf-worker.js. If it cannot emit that " +
            'file, import `localEngine` from `@embedpdf/engine/portable`, or copy the file and ' +
            'pass its URL as `worker`. See https://www.embedpdf.com/docs/viewer/self-hosting',
          { cause: error },
        );
      }
    },
    lazyOptions: {},
  };
}

function postWorkerInit(worker: Worker, wasm: ResolvedWasmSource): void {
  const init: EngineWorkerInit = { kind: 'init', wasmUrl: wasm.wasmUrl };
  if (wasm.wasmBinary) init.wasmBinary = wasm.wasmBinary;
  worker.postMessage(init, wasm.wasmBinary ? [wasm.wasmBinary] : []);
}

interface CreatedWorker {
  worker: Worker;
  /** Runs once the handshake settles: revokes a blob: URL. */
  dispose: () => void;
  /** The bundled file it started from, for the error when it never starts. */
  file: string | null;
}

/**
 * Create the worker for a non-live delivery. The default starts the bundled
 * `workers/embedpdf-worker.js` (see {@link findEngineWorkerFile}). Where no
 * worker can start from that file (the scripts on another origin than the
 * page), and for `'inline'`, the worker starts from a blob: URL of the same
 * bundle as a string — its own lazily imported module, so bundlers emit it as
 * a separate chunk that is only downloaded when this line runs. The blob URL
 * is revoked once the handshake settles.
 */
async function createEngineWorker(
  delivery: Exclude<WorkerSource, Worker> | undefined,
  configuredUrl: string | null,
): Promise<CreatedWorker> {
  if (typeof delivery === 'function') {
    return { worker: delivery(), dispose: () => {}, file: null };
  }
  if (configuredUrl !== null) {
    return {
      worker: startWorker(configuredUrl, { type: 'module' }),
      dispose: () => {},
      file: null,
    };
  }
  const file = delivery === undefined ? findEngineWorkerFile() : null;
  if (file !== null) {
    return { worker: startWorker(file, { type: 'module' }), dispose: () => {}, file };
  }

  let source: string;
  try {
    source = (await import('@embedpdf/engine/worker-source')).default;
  } catch (cause) {
    throw new Error(
      '[embedpdf] could not load the inline engine worker module ' +
        '(@embedpdf/engine/worker-source). If your bundler cannot resolve it, pass a ' +
        'worker explicitly: `localEngine({ worker: () => new Worker(...) })`.',
      { cause },
    );
  }
  const blob = createWorkerBlobUrl(source);
  try {
    const worker = startWorker(blob.url, { type: 'module' });
    return { worker, dispose: blob.revoke, file: null };
  } catch (cause) {
    blob.revoke();
    throw new Error(
      '[embedpdf] could not start the engine worker from a blob: URL, which it uses when ' +
        "the viewer's scripts are on another origin than the page (a browser starts a worker " +
        "only from the page's own) or when `worker` is `'inline'`. Allow `worker-src blob:`, or " +
        "serve the viewer's files from your own origin. See " +
        'https://www.embedpdf.com/docs/viewer/concepts/security',
      { cause },
    );
  }
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

export interface LocalEngineRecipeOptions extends WasmSourceOptions {
  /**
   * The worker backing the engine — see {@link WorkerSource}. Omit for the
   * zero-config default: this package's `workers/embedpdf-worker.js`, which
   * your bundler emits as a file of your build (`worker-src 'self'`), or a
   * blob: URL when the scripts are on another origin than the page. Pass a
   * same-origin URL to a copied `workers/embedpdf-worker.js` to serve it
   * yourself, or a `() => Worker` thunk (called once at boot) for full
   * control — a custom worker build, a shared lifecycle, ... A live `Worker`
   * also works, but the thunk form keeps construction fully allocation-free.
   */
  worker?: WorkerSource;
  /**
   * The image-encoder worker pool's delivery — see
   * {@link EncoderWorkerSource}. Omit for the default, delivered like
   * `worker` (with a main-thread fallback if the workers cannot start);
   * pass a same-origin URL to a copied `workers/encoder-worker.js`, or
   * `false` to always encode on the main thread. Ignored when `imageEncoder`
   * is set.
   */
  encoderWorker?: EncoderWorkerSource;
  /**
   * Fonts registered and appended to the ordered glyph-fallback chain, in
   * order — the ones that substitute missing glyphs during rendering and
   * appearance generation (e.g. a CJK fallback). This is the common case.
   */
  fallbackFonts?: RecipeFontSpec[];
  /**
   * Fonts registered but not added to the fallback chain — available for
   * explicit annotation authoring (a FreeText `fontFamily`) without affecting
   * automatic substitution.
   */
  fonts?: RecipeFontSpec[];
  /** WorkerQueue concurrency (default 1). */
  concurrency?: number;
  /** Custom raster encoder (thumbnails / image export). */
  imageEncoder?: LocalImageEncoder;
  /**
   * Deployment render policy — the local counterpart of the lattice a
   * cloud deployment advertises, configured the way permissions are
   * overridden: by the embedder, at construction. See
   * {@link LocalEngineOptions.renderPolicy}. Default: `continuous`.
   */
  renderPolicy?: EngineRenderPolicy;
  /** How a signed document's protection is applied. See {@link LocalEngineOptions.signedDocumentPolicy}. */
  signedDocumentPolicy?: LocalEngineOptions['signedDocumentPolicy'];
  /**
   * Where there is no `Worker` (Node), PDFium runs in this thread: natively
   * when this platform has a build, as WebAssembly otherwise. `runtime`
   * chooses (`{ prefer: 'wasm' }`). Ignored where the engine runs a worker.
   */
  runtime?: CreatePdfRuntimeOptions;
}

/**
 * Create a local {@link LocalEngine}: PDFium in a Web Worker in the browser,
 * in this thread where there is no `Worker` (Node, natively when the
 * platform has a build). One factory for every environment.
 *
 * Synchronous and cheap: the returned object is a fully usable {@link Engine},
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
  const boot = runsInThisThread(options)
    ? {
        spawn: async (): Promise<Transport> =>
          new InlineTransport(await createPdfRuntime(options.runtime ?? {})),
        lazyOptions: {},
      }
    : workerBoot(options.worker, options);
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
    imageEncoder:
      options.imageEncoder ??
      (options.encoderWorker !== undefined
        ? new BrowserImageEncoder({ worker: options.encoderWorker })
        : undefined),
    renderPolicy: options.renderPolicy,
    signedDocumentPolicy: options.signedDocumentPolicy,
  });
  return engine;
}

/**
 * No `Worker` global and no worker of the caller's own (Node, Deno, a test
 * runner): PDFium runs in this thread instead of in a worker. `'inline'` only
 * says how to make the worker where there is one.
 */
function runsInThisThread(options: LocalEngineRecipeOptions): boolean {
  const ownWorker = options.worker !== undefined && options.worker !== 'inline';
  return !ownWorker && typeof Worker === 'undefined';
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
 * Register boot-config fonts by raw transport send, bypassing the WorkerQueue.
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
    // Seed before the raw send: seeding copies the bytes, and the wire buffer
    // is transferred (neutered) by the worker transport.
    fontService.seedRegistered(spec, { fallback });
    const bytes = toStandaloneArrayBuffer(spec.data);
    const registered = await requestOverTransport(transport, (jobId) =>
      wirePack(
        {
          kind: 'fonts.register',
          effect: 'runtimeWrite',
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
    if (registered.tag === 'fonts.register') {
      fontService.applyIdentity(spec.key, registered.identity);
    }
    if (fallback) {
      await requestOverTransport(transport, (jobId) =>
        wirePack({ kind: 'fonts.addFallback', effect: 'runtimeWrite', jobId, fontKey: spec.key }),
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
