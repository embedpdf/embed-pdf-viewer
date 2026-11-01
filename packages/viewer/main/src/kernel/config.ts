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
import { isPdf, PluginError, type HostFetch } from '@embedpdf/core';
import type { OpenInput } from '@embedpdf/engine-core/runtime';
import type {
  InitialDocument,
  ViewerCustomization,
  ViewerPluginsConfig,
} from '@embedpdf/viewer-chrome';

/** One document for `src`: a URL, a `File` (or any `Blob`), or the PDF's bytes. */
export type DocumentSrc = string | Blob | ArrayBuffer | Uint8Array;

/** One of the documents `documents` opens, each in a tab of its own. */
export interface DocumentEntry<Src = DocumentSrc> {
  /** The document: a URL, a `File`, or bytes. */
  readonly src: Src;
  /** What its tab shows; the file's name when left out. */
  readonly name?: string;
  /** Its password, if it has one: nobody is asked for it. */
  readonly password?: string;
  /** Show this one first; without one marked, the first document shows. */
  readonly active?: boolean;
}

/** Everything a delivery needs except the engine seam — the part every door
 *  agrees on. Doors extend this and add their own `engine` field, and a door
 *  whose engine opens other documents names them as its `Src`. */
export interface ViewerConfigBase<Src = DocumentSrc> extends ViewerCustomization {
  /** One document: a URL, a `File`, or bytes. Follows its prop: another one
   *  opens in its place, and `null` closes it. */
  src?: Src | null;
  /** Several documents, each in a tab, with their names, passwords and the one
   *  that shows first. With these, `src` is ignored. Read once. */
  documents?: readonly DocumentEntry<Src>[];
  /** How a document at a URL downloads: your own `fetch`, to add headers or
   *  cookies. It gets the URL and an `init` with the document's cancel
   *  `signal`, to pass on, and runs again on **Try again**. Follows its prop:
   *  the next download uses the new one. */
  fetch?: HostFetch;
}

/**
 * What the element opens: a URL, a file or bytes, an engine's open input as it is (what an engine
 * of your own takes), or a document in the words of the door's engine, such as the cloud's
 * `{ token }`, which the door turns into its engine's open input (`DoorEngine.sourceOf`). The
 * element serves every door, so it reads only the first three; the rest is the door's.
 */
export type ElementSrc = DocumentSrc | OpenInput | object;

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
 * `<PDFViewer>`, which are where typed config belongs. Its documents are the
 * widest too: what any door's `src` becomes ({@link ElementSrc}).
 */
export interface ElementConfig extends ViewerConfigBase<ElementSrc> {
  engine?: unknown;
}

/** The config keys a running viewer follows; a change to any other key mounts a new viewer. */
export type LiveConfigKey = 'src' | 'theme' | 'locale' | 'disable' | 'readOnly' | 'fetch';

const LIVE_CONFIG_KEYS: ReadonlySet<string> = new Set<LiveConfigKey>([
  'src',
  'theme',
  'locale',
  'disable',
  'readOnly',
  'fetch',
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
export function changedConfigKeys(previous: ElementConfig, next: ElementConfig): string[] {
  const before = previous as Readonly<Record<string, unknown>>;
  const after = next as Readonly<Record<string, unknown>>;
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys].filter((key) => !sameConfigValue(before[key], after[key]));
}

/** The door's plugin settings under the config's own, plugin by plugin: a key the config sets wins. */
export function pluginsOf(
  door: ViewerPluginsConfig | undefined,
  own: ViewerPluginsConfig | undefined,
): ViewerPluginsConfig | undefined {
  if (!door) return own;
  const merged: { [name: string]: object | undefined } = { ...door };
  for (const [name, settings] of Object.entries(own ?? {})) {
    const under = door[name];
    merged[name] =
      under && settings && Object.getPrototypeOf(settings) === Object.prototype
        ? { ...under, ...settings }
        : settings;
  }
  return merged;
}

/** Whether a `src` is an engine's open input, which opens as it is. */
export const isOpenInput = (src: ElementSrc): src is OpenInput =>
  typeof src === 'object' && 'kind' in src;

/** Whether the element reads a `src` itself: a URL, a file or bytes. */
const isReadable = (src: ElementSrc): src is DocumentSrc =>
  typeof src === 'string' ||
  src instanceof ArrayBuffer ||
  src instanceof Uint8Array ||
  (typeof Blob !== 'undefined' && src instanceof Blob);

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

/**
 * The id a `src` document asks for, before it's made unique: its URL, its file's name, or the
 * id an open input names. An open input that names none gets its id from the engine.
 */
export const idOfSrc = (src: ElementSrc): string =>
  typeof src === 'string'
    ? src
    : isOpenInput(src)
      ? 'id' in src && typeof src.id === 'string'
        ? src.id
        : 'document'
      : typeof File !== 'undefined' && src instanceof File
        ? src.name
        : 'document';

/** What a door's `sourceOf` makes of a `src`: what the element opens. */
export type SourceOf = (src: ElementSrc) => ElementSrc;

/**
 * A `src` as a document to open, under the id given: its tab appears at once, named after the
 * file. A URL downloads under the loading tab with the viewer's `fetch`, which stops when the tab
 * closes first; a file or bytes are read there; either fails as `invalid-input` when it isn't a
 * PDF. An open input opens as it is, once `after` settles: a document of the same id still
 * closing would refuse it, and only the engine knows which document it names.
 */
export function documentFromSrc(
  src: ElementSrc,
  id: string,
  after: Promise<unknown> = Promise.resolve(),
): InitialDocument {
  if (isOpenInput(src)) {
    return {
      source: async () => {
        await after;
        return src;
      },
    };
  }
  if (!isReadable(src)) {
    // A document in an engine's own words whose door didn't say how it opens.
    return {
      source: async () => {
        throw new PluginError('invalid-input', 'documents', "this viewer can't open that document");
      },
    };
  }
  const name = nameOfSrc(src);
  if (typeof src === 'string') return { name, source: async () => ({ kind: 'url', url: src, id }) };
  return {
    name,
    source: async () => {
      // Given bytes go as a view: the engine copies a view, where it would move a buffer to
      // its worker and leave the app's own copy empty for the next open.
      const bytes =
        src instanceof Blob ? new Uint8Array(await src.arrayBuffer()) : new Uint8Array(src);
      // Said here, where it's known: the engine says only that it couldn't open the file.
      if (!isPdf(bytes)) throw new PluginError('invalid-input', 'documents', `${name} isn't a PDF`);
      return { kind: 'bytes', id, bytes };
    },
  };
}

/**
 * The `documents` entries as the documents to open, in order: each under an id of its own (the
 * second of one URL gets `#2` after it), named as given or after its file, with its password,
 * and the first one marked `active` showing first. Each `src` is first what the door makes of it
 * (`sourceOf`), and an open input opens as it is.
 */
export function initialDocumentsOf(
  entries: readonly DocumentEntry<ElementSrc>[],
  sourceOf: SourceOf = (src) => src,
): InitialDocument[] {
  const taken = new Set<string>();
  const freeId = (wanted: string): string => {
    let id = wanted;
    for (let index = 2; taken.has(id); index++) id = `${wanted}#${index}`;
    taken.add(id);
    return id;
  };
  return entries.map(({ src: given, name, password, active }) => {
    const src = sourceOf(given);
    return {
      ...(isOpenInput(src) ? { source: src } : documentFromSrc(src, freeId(idOfSrc(src)))),
      ...(name !== undefined ? { name } : {}),
      ...(password !== undefined ? { password } : {}),
      ...(active ? { active } : {}),
    };
  });
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
