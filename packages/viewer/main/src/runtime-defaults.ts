/**
 * Delivery-time defaults — the seam where ENTRIES tell the (engine-agnostic)
 * element what "no explicit engine config" means:
 *
 * - the DEFAULT ENGINE PROVIDER, registered by the npm/snippet entries
 *   (`src/index.ts` via ./local-default): turns the config's engine OPTIONS
 *   (or nothing) into the built-in local engine. The `core` entry registers
 *   nothing — a cloud/custom build injects its own `engine:` and never pulls
 *   the local engine into its module graph.
 *
 * - the SNIPPET WASM URL, set by the snippet entry (`src/snippet.ts`): the
 *   npm entry sets nothing (inside an app bundler the artifact has no
 *   reliable location, so the engine's own sibling-first default applies),
 *   while the snippet is loaded as a REAL URL module and self-locates —
 *   `pdfium.wasm` ships next to `embedpdf.js` in dist, so air-gapping the
 *   snippet is "copy the folder".
 */
import type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';

/** Turns the config's `engine` field (when it is OPTIONS or absent — not a
 *  live Engine or factory) into the delivery's default engine. */
export type DefaultEngineProvider = (engineOption: unknown) => Engine | EngineFactory;

let defaultEngineProvider: DefaultEngineProvider | null = null;

export function setDefaultEngineProvider(provider: DefaultEngineProvider): void {
  defaultEngineProvider = provider;
}

export function getDefaultEngineProvider(): DefaultEngineProvider | null {
  return defaultEngineProvider;
}

let snippetWasmUrl: string | null = null;

export function setSnippetWasmUrl(url: string): void {
  snippetWasmUrl = url;
}

export function getSnippetWasmUrl(): string | null {
  return snippetWasmUrl;
}
