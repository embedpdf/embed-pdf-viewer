/**
 * The KERNEL's config: the chrome's customization contract + document sourcing.
 *
 * Deliberately door-blind. `ViewerCustomization` is shared verbatim (README of
 * @embedpdf/viewer-chrome is the law for it); this file adds only what any
 * delivery needs — where the PDFs come from. The engine seam is NOT declared
 * here: each door declares its own (see ../doors and ../local), because a
 * config type may only promise what its door's imports actually deliver.
 */
import type { InitialDocument, ViewerCustomization } from '@embedpdf/viewer-chrome';

/** Everything a delivery needs EXCEPT the engine seam — the part every door
 *  agrees on. Doors extend this and add their own `engine` field. */
export interface ViewerConfigBase extends ViewerCustomization {
  /** URL of a PDF to open at startup — the one-liner path. */
  src?: string;
  /** Full control: several documents, names, passwords, the active tab. */
  documents?: InitialDocument[];
}

/**
 * The config as the ELEMENT sees it — a courier's view.
 *
 * `engine` is `unknown` because the element is ONE compiled class serving every
 * door, and it must carry a value only the sending door understands: a live
 * `Engine`, a factory, or that door's plain-data options bag. It opens the
 * envelope just far enough to spot an engine, and otherwise hands it to
 * whichever provider its door registered (see element.ts `engineOf`). Typing it
 * narrower would either forbid a legal door vocabulary or advertise one that a
 * different door cannot honour — the lie we removed from `init()` and
 * `<PDFViewer>`, which are where typed config belongs.
 */
export interface ElementConfig extends ViewerConfigBase {
  engine?: unknown;
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

export function initialDocumentsOf(config: ViewerConfigBase): InitialDocument[] | undefined {
  if (config.documents) return config.documents;
  if (config.src) return [documentFromSrc(config.src)];
  return undefined;
}

/** Declarative use: `<embedpdf-viewer src="…" locale="…" theme="…">`. */
export function configFromAttributes(el: HTMLElement): ViewerConfigBase {
  const config: ViewerConfigBase = {};
  const src = el.getAttribute('src');
  const locale = el.getAttribute('locale');
  const theme = el.getAttribute('theme');
  if (src) config.src = src;
  if (locale) config.locale = locale;
  if (theme === 'light' || theme === 'dark' || theme === 'system') config.theme = theme;
  return config;
}
