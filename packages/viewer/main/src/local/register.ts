/**
 * Registers the built-in LOCAL engine as the element's default.
 *
 * This is the one place the local engine enters the viewer's runtime module
 * graph — calling `registerLocalEngine()` IS what makes a door the local door.
 * The engine-agnostic door never calls it, and so structurally excludes PDFium:
 * no wasm, no worker source, no stub surgery.
 */
import { localEngine } from '@embedpdf/engine';

import { EmbedPdfViewerElement } from '../kernel';

import type { LocalEngineConfig } from './config';

export interface LocalEngineDefaults {
  /**
   * Fallback wasm location, used only when the config names no wasm source of
   * its own. The snippet door passes its self-located `pdfium.wasm` sibling
   * here; the npm door passes nothing, leaving the engine's own bundler-default
   * resolution in charge. Passing it in beats module-level state: the door's
   * one difference is visible at the call site.
   */
  wasmUrl?: string;
}

export function registerLocalEngine(defaults: LocalEngineDefaults = {}): void {
  EmbedPdfViewerElement.defaultEngineProvider = (option: unknown) => {
    const local: LocalEngineConfig = { ...(option as LocalEngineConfig | undefined) };
    if (defaults.wasmUrl && !local.wasmUrl && !local.wasmBinary && !local.assetsUrl) {
      local.wasmUrl = defaults.wasmUrl;
    }
    // A thunk, so the viewer owns the engine's lifetime.
    return () => localEngine(local);
  };
}
