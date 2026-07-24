/**
 * The snippet's config = the chrome's customization contract + document
 * sourcing + the engine seam. `ViewerCustomization` is shared verbatim
 * (README of @embedpdf/viewer-chrome is the law for it); this file only adds
 * what a DELIVERY needs: where the PDFs come from and which engine renders
 * them.
 */
import type { InitialDocument, ViewerCustomization } from '@embedpdf/viewer-chrome';
import type { Engine, EngineFactory } from '@embedpdf/engine-core/runtime';
import type { LocalEngineRecipeOptions } from '@embedpdf/engine';

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

export interface ViewerConfig extends ViewerCustomization {
  /** URL of a PDF to open at startup — the one-liner path. */
  src?: string;
  /** Full control: several documents, names, passwords, the active tab. */
  documents?: InitialDocument[];
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

const fetchBytes = async (url: string): Promise<Uint8Array> => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`[embedpdf] failed to fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** `src` sugar → a lazy-bytes document: the tab appears at t≈0 (named after
 *  the file), the fetch runs under the loading tab. */
const documentFromSrc = (src: string): InitialDocument => ({
  name: decodeURIComponent(src.split('/').pop() ?? 'Document').replace(/\.pdf$/i, ''),
  source: async () => ({ kind: 'bytes', id: src, bytes: await fetchBytes(src) }),
});

export function initialDocumentsOf(config: ViewerConfig): InitialDocument[] | undefined {
  if (config.documents) return config.documents;
  if (config.src) return [documentFromSrc(config.src)];
  return undefined;
}

/** Declarative use: `<embedpdf-viewer src="…" locale="…" theme="…">`. */
export function configFromAttributes(el: HTMLElement): ViewerConfig {
  const config: ViewerConfig = {};
  const src = el.getAttribute('src');
  const locale = el.getAttribute('locale');
  const theme = el.getAttribute('theme');
  if (src) config.src = src;
  if (locale) config.locale = locale;
  if (theme === 'light' || theme === 'dark' || theme === 'system') config.theme = theme;
  return config;
}
