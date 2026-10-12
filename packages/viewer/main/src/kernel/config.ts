/**
 * The kernel's config: the chrome's customization contract + document sourcing.
 *
 * Deliberately door-blind. `ViewerCustomization` is shared verbatim (README of
 * @embedpdf/viewer-chrome is the law for it); this file adds only what any
 * delivery needs — where the PDFs come from, and which keys a running viewer
 * follows. The engine seam is not declared
 * here: each door declares its own (see ../doors and ../local), because a
 * config type may only promise what its door's imports actually deliver.
 */
import type { InitialDocument, ViewerCustomization } from '@embedpdf/viewer-chrome';

/** One document for `src`: a URL, a `File` (or any `Blob`), or the PDF's bytes. */
export type DocumentSrc = string | Blob | ArrayBuffer | Uint8Array;

/** Everything a delivery needs except the engine seam — the part every door
 *  agrees on. Doors extend this and add their own `engine` field. */
export interface ViewerConfigBase extends ViewerCustomization {
  /** One document: a URL, a `File`, or bytes. Follows its prop: another one
   *  opens in its place, and `null` closes it. */
  src?: DocumentSrc | null;
  /** Full control: several documents, names, passwords, the active tab.
   *  With these, `src` is ignored. */
  documents?: InitialDocument[];
}

/**
 * The config as the element sees it — a courier's view.
 *
 * `engine` is `unknown` because the element is one compiled class serving every
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

/** The config keys a running viewer follows; a change to any other key mounts a new viewer. */
export type LiveConfigKey = 'src' | 'theme' | 'locale' | 'disable' | 'readOnly';

const LIVE_CONFIG_KEYS: ReadonlySet<string> = new Set<LiveConfigKey>([
  'src',
  'theme',
  'locale',
  'disable',
  'readOnly',
]);

export const isLiveConfigKey = (key: string): key is LiveConfigKey => LIVE_CONFIG_KEYS.has(key);

const isPlainObject = (value: unknown): value is Readonly<Record<string, unknown>> => {
  if (typeof value !== 'object' || value === null) return false;
  const prototype: unknown = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
};

/**
 * Whether two config values are the same: arrays and plain objects by their entries, so an
 * inline `disable={['forms']}` is no change; everything else (functions, files, bytes, engines)
 * by identity. A missing key and `undefined` are the same.
 */
export function sameConfigValue(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length &&
      left.every((item, index) => sameConfigValue(item, right[index]))
    );
  }
  if (isPlainObject(left) && isPlainObject(right)) {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => sameConfigValue(left[key], right[key]));
  }
  return false;
}

/** The keys whose values differ between two configs (see {@link sameConfigValue}). */
export function changedConfigKeys(previous: ViewerConfigBase, next: ViewerConfigBase): string[] {
  const before = previous as Readonly<Record<string, unknown>>;
  const after = next as Readonly<Record<string, unknown>>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !sameConfigValue(before[key], after[key]));
}

const fetchBytes = async (url: string, signal: AbortSignal): Promise<Uint8Array> => {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`[embedpdf] failed to fetch ${url}: ${response.status}`);
  return new Uint8Array(await response.arrayBuffer());
};

/** What a `src` document's tab shows: the file's name without `.pdf`. */
function nameOfSrc(src: DocumentSrc): string {
  const name =
    typeof src === 'string'
      ? decodeURIComponent(src.split('?')[0]!.split('/').pop() ?? '')
      : typeof File !== 'undefined' && src instanceof File
        ? src.name
        : '';
  return name.replace(/\.pdf$/i, '') || 'Document';
}

/** The id a `src` document asks for, before it's made unique: its URL, or its file's name. */
export const idOfSrc = (src: DocumentSrc): string =>
  typeof src === 'string'
    ? src
    : typeof File !== 'undefined' && src instanceof File
      ? src.name
      : 'document';

/**
 * A `src` as a document to open, under the id given: its tab appears at once, named after the
 * file, and the bytes are read (a URL fetched) under the loading tab, which stops the fetch when
 * the tab closes first.
 */
export function documentFromSrc(src: DocumentSrc, id: string): InitialDocument {
  return {
    name: nameOfSrc(src),
    source: async (signal) => ({
      kind: 'bytes',
      id,
      // Given bytes go as a view: the engine copies a view, where it would move a buffer to
      // its worker and leave the app's own copy empty for the next open.
      bytes:
        typeof src === 'string'
          ? await fetchBytes(src, signal)
          : src instanceof Blob
            ? new Uint8Array(await src.arrayBuffer())
            : new Uint8Array(src),
    }),
  };
}

/**
 * The config an element shows: its attributes, under the `.config` it was given. A key the
 * config leaves out, or sets to `undefined`, comes from its attribute.
 */
export function mergeConfig(
  attributes: ViewerConfigBase,
  config: ElementConfig | null,
): ElementConfig {
  if (!config) return attributes;
  const merged: Record<string, unknown> = { ...attributes };
  for (const [key, value] of Object.entries(config)) if (value !== undefined) merged[key] = value;
  return merged as ElementConfig;
}

/** Declarative use: `<embedpdf-viewer src="…" locale="…" theme="…">`. */
export function configFromAttributes(element: HTMLElement): ViewerConfigBase {
  const config: ViewerConfigBase = {};
  const src = element.getAttribute('src');
  const locale = element.getAttribute('locale');
  const theme = element.getAttribute('theme');
  if (src) config.src = src;
  if (locale) config.locale = locale;
  if (theme === 'light' || theme === 'dark' || theme === 'system') config.theme = theme;
  return config;
}
