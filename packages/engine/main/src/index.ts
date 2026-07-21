/**
 * @embedpdf/engine - Engine v3 local implementation.
 *
 * Public API:
 *   localEngine(options?)               -> EngineFactory (the recipe; hand to <Viewer>)
 *   createLocalEngine()                 -> LocalEngine using inline transport
 *   createLocalEngineWithWorker(worker) -> LocalEngine using a Web Worker
 *
 * Both implementations satisfy the same Engine interface from
 * @embedpdf/engine-core.
 */
import { type EngineFactory, type FontSpec } from '@embedpdf/engine-core/runtime';
import { createPdfRuntime, type CreatePdfRuntimeOptions } from '@embedpdf/engine-runtime';

import { LocalEngine, type LocalEngineOptions } from './LocalEngine';
import { BrowserWorkerTransport } from './transport/BrowserWorkerTransport';
import { InlineTransport } from './transport/InlineTransport';
import type { LocalImageEncoder } from './render/BrowserImageEncoder';

export type { EngineFactory } from '@embedpdf/engine-core/runtime';
export { LocalEngine } from './LocalEngine';
export type { LocalEngineOptions } from './LocalEngine';
export type { Transport } from './transport/Transport';
export { InlineTransport } from './transport/InlineTransport';
export { BrowserWorkerTransport } from './transport/BrowserWorkerTransport';
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
  /** Forwarded to @embedpdf/engine-runtime when no transport is provided. */
  runtime?: CreatePdfRuntimeOptions;
}

/**
 * Create a LocalEngine that runs PDFium inline in the current thread.
 * Suitable for Node, tests, and as a worker-less browser fallback.
 */
export async function createLocalEngine(opts: CreateLocalEngineOptions = {}): Promise<LocalEngine> {
  const runtime = await createPdfRuntime(opts.runtime ?? {});
  const transport = new InlineTransport(runtime);
  return LocalEngine.fromTransport({ transport, concurrency: opts.concurrency });
}

export interface CreateLocalEngineWithWorkerOptions extends Omit<LocalEngineOptions, 'transport'> {
  worker: Worker;
}

/**
 * Create a LocalEngine that talks to an existing Web Worker. The worker
 * must be wired up to engine-local's worker-entry (see src/worker/worker-entry.ts).
 */
export async function createLocalEngineWithWorker(
  opts: CreateLocalEngineWithWorkerOptions,
): Promise<LocalEngine> {
  const transport = await BrowserWorkerTransport.spawn(opts.worker);
  return LocalEngine.fromTransport({ transport, concurrency: opts.concurrency });
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
   * ({@link spawnDefaultWorker}). Pass a `Worker` (or a `() => Worker` thunk,
   * called once at boot) for a custom setup — CSP nonces, a bundler without
   * `new URL` worker support, a shared worker, ...
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
  /**
   * Escape hatch for engine-specific setup that needs the live engine in hand
   * (anything beyond fonts). Runs after fonts are registered, before the
   * recipe resolves — so the engine is fully configured before the first
   * `open()`.
   */
  onReady?: (engine: LocalEngine) => void | Promise<void>;
}

/**
 * The local-engine RECIPE: describe a PDFium-in-a-Worker engine and get back an
 * {@link EngineFactory} you hand to `<Viewer>` (or `provideEmbedPdf`, or
 * `deferredEngine` if you want to own the lifetime — see {@link deferredEngine}).
 *
 * The recipe is inert until called: constructing it at module scope allocates
 * no Worker and touches no WASM, so it is safe on a server (Next/Nuxt SSR) and
 * cheap to evaluate eagerly. The returned factory, on each call, spawns a fresh
 * worker, boots the engine, registers fonts, runs `onReady`, and resolves — so
 * a viewer remount (React StrictMode) yields an independent engine that its own
 * unmount tears down.
 *
 * ```ts
 * const engine = localEngine({
 *   fallbackFonts: [{ key: 'noto-cjk', url: '/fonts/NotoSansCJK.ttf' }],
 * });
 * <Viewer engine={engine} plugins={[stagePlugin(), renderPlugin()]} />
 * ```
 */
export function localEngine(options: LocalEngineRecipeOptions = {}): EngineFactory {
  return async () => {
    const worker = typeof options.worker === 'function' ? options.worker() : options.worker;
    const engine = await createLocalEngineWithWorker({
      worker: worker ?? spawnDefaultWorker(),
      concurrency: options.concurrency,
      imageEncoder: options.imageEncoder,
    });
    try {
      await registerRecipeFonts(engine, options);
      await options.onReady?.(engine);
    } catch (error) {
      // A half-configured engine must not leak its worker: tear it down before
      // surfacing the boot failure.
      await engine.destroy().catch(() => {});
      throw error;
    }
    return engine;
  };
}

async function registerRecipeFonts(
  engine: LocalEngine,
  options: LocalEngineRecipeOptions,
): Promise<void> {
  const plain = options.fonts ?? [];
  const fallback = options.fallbackFonts ?? [];
  if (plain.length === 0 && fallback.length === 0) return;

  if (!engine.fonts) {
    throw new Error(
      '[embedpdf] localEngine: engine did not expose `fonts` — cannot register the configured fonts',
    );
  }

  for (const spec of plain) {
    await engine.fonts.register(await toFontSpec(spec));
  }
  // Register then add-to-fallback in declared order: fallback precedence is
  // registration order (first font covering a missing glyph wins).
  for (const spec of fallback) {
    const handle = await engine.fonts.register(await toFontSpec(spec));
    await engine.fonts.addFallback(handle);
  }
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
