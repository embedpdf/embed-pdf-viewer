/**
 * The LOCAL door's vocabulary. It lives here — next to `register.ts`, the only
 * code that can interpret it — and not in the kernel, because the options bag
 * below is meaningless anywhere the built-in engine was not imported.
 */
import type { LocalEngineRecipeOptions } from '@embedpdf/engine';
import type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';

import type { MountTarget, ViewerConfigBase } from '../kernel';

/**
 * Configuration for the built-in local engine (PDFium wasm in a worker) —
 * the `localEngine()` options, verbatim. The common fields are plain data
 * (`wasmUrl`, `assetsUrl`, `worker`/`encoderWorker` as URLs), so a
 * self-hosting or strict-CSP setup stays declarative:
 *
 * ```ts
 * EmbedPDF.init({
 *   target: '#viewer',
 *   src: '/report.pdf',
 *   engine: { assetsUrl: '/embedpdf/', worker: '/embedpdf/pdfium-worker.js' },
 * });
 * ```
 */
export type LocalEngineConfig = LocalEngineRecipeOptions;

/**
 * The local door's config: the built-in PDFium engine is registered as the
 * default here, so the seam is optional and additionally accepts its options
 * bag. (On the engine-agnostic door the same name means something stricter —
 * see ../doors/core.ts.)
 */
export interface ViewerConfig extends ViewerConfigBase {
  /**
   * The engine seam. Omit for the built-in local engine with its defaults;
   * pass a {@link LocalEngineConfig} to configure it (self-hosted wasm,
   * strict-CSP workers, fallback fonts, ...); or inject a different
   * implementation entirely — an `Engine` instance (borrowed: you own its
   * lifetime) or an `EngineFactory` thunk (viewer-owned: created on mount,
   * destroyed on unmount), e.g. a cloud engine.
   */
  engine?: Engine | EngineFactory | LocalEngineConfig;
}

export interface InitOptions extends ViewerConfig, MountTarget {}
