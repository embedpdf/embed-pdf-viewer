/**
 * Registers the built-in local engine as the element's default.
 *
 * Calling `registerLocalEngine()` is what makes a door the local door. The door hands over the
 * engine's `localEngine` itself, from `@embedpdf/engine` or from `@embedpdf/engine/portable`, so
 * each door's module graph carries the one engine entry it imports. The engine-agnostic door
 * never calls it, and so structurally excludes PDFium: no wasm, no worker source, no stub surgery.
 */
import type { LocalEngine } from '@embedpdf/engine';

import { EmbedPdfViewerElement } from '../kernel';

import type { LocalEngineConfig } from './config';

/** `localEngine` from the engine entry the door imports. */
export type LocalEngineRecipe = (options: LocalEngineConfig) => LocalEngine;

export interface LocalEngineDefaults {
  /**
   * Fallback wasm location, used only when the config names no wasm source of
   * its own. The snippet door passes its self-located `embedpdf.wasm` sibling
   * here; the npm doors pass nothing, leaving the engine's own default
   * resolution in charge. Passing it in beats module-level state: the door's
   * one difference is visible at the call site.
   */
  wasmUrl?: string;
}

export function registerLocalEngine(
  localEngine: LocalEngineRecipe,
  defaults: LocalEngineDefaults = {},
): void {
  EmbedPdfViewerElement.defaultEngineProvider = (option: unknown) => {
    // The viewer registers `fonts` itself, reading each once: the style panel offers a font
    // only when it's registered on the engine and mounted for the live text editor too.
    const { fonts, ...local }: LocalEngineConfig = { ...(option as LocalEngineConfig | undefined) };
    if (defaults.wasmUrl && !local.wasmUrl && !local.wasmBinary && !local.assetsUrl) {
      local.wasmUrl = defaults.wasmUrl;
    }
    // A thunk, so the viewer owns the engine's lifetime.
    return { engine: () => localEngine(local), fonts };
  };
}
