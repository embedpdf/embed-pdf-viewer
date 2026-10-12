/** What every family {@link mountWebFont} mounts starts with. */
const FAMILY_PREFIX = 'epdf-';

/**
 * The CSS family a registered font's key is mounted under: the key in the
 * viewer's own namespace, so a family of the same name on the page (its own
 * `@font-face`, or an installed font) never stands in for it. The annotation
 * plugin's CSS for a registered font names the same family.
 */
export function webFontFamily(key: string): string {
  return `${FAMILY_PREFIX}${key}`;
}

/** The key a family from {@link webFontFamily} was made from; any other family as it is. */
export function fontKeyOfWebFamily(family: string): string {
  return family.startsWith(FAMILY_PREFIX) ? family.slice(FAMILY_PREFIX.length) : family;
}

/**
 * Mount a registered font for the DOM: the engine lays text out with the
 * font's bytes, the browser needs the same face as a `@font-face` so the
 * live editor and the vector renderer show the glyphs the appearance stream
 * will bake. The face's family is {@link webFontFamily} of the key.
 *
 * Returns the unmount. Idempotent per (document, key): a second mount of a
 * key already in the document's font set is a no-op that still returns an
 * unmount of its own (the face leaves when the last holder unmounts).
 */
export async function mountWebFont(
  key: string,
  data: ArrayBuffer | Uint8Array,
  options: { document?: Document; weight?: number | string; style?: 'normal' | 'italic' } = {},
): Promise<() => void> {
  return mountFace(webFontFamily(key), data, options);
}

interface FaceOptions {
  readonly document?: Document;
  readonly weight?: number | string;
  readonly style?: 'normal' | 'italic';
}

/** Mount one face under `family`, refcounted per (document, family). */
async function mountFace(
  family: string,
  data: ArrayBuffer | Uint8Array,
  options: FaceOptions,
): Promise<() => void> {
  const doc = options.document ?? document;
  const fonts = doc.fonts;
  if (!fonts || typeof FontFace === 'undefined') return () => {};
  const holders = holdersOf(doc);
  const existing = holders.get(family);
  if (existing) {
    existing.count++;
    return () => release(holders, family);
  }
  const buffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data;
  const face = new FontFace(family, buffer, {
    weight: options.weight !== undefined ? String(options.weight) : undefined,
    style: options.style,
  });
  holders.set(family, { face, doc, count: 1 });
  try {
    await face.load();
    fonts.add(face);
  } catch {
    holders.delete(family);
    return () => {};
  }
  notifyFontChange(doc);
  return () => release(holders, family);
}

/**
 * A font program to mount: its CSS family, its style, and its bytes. The
 * structural twin of `@embedpdf/core-fonts`' `FontProgram`, whose family is
 * named by the program's hash, so it never shadows another font.
 */
export interface MountableFontProgram {
  readonly family: string;
  readonly weight: number;
  readonly style: 'normal' | 'italic';
  load(): Promise<Uint8Array>;
}

/**
 * Mount a program under its own family, as it is (already in the viewer's
 * namespace), in its own weight and style, so CSS asking for that style takes
 * it as it is and never fakes a bold or an italic. Refcounted per document
 * like {@link mountWebFont}; resolves with the unmount.
 */
export async function mountFontProgram(
  program: MountableFontProgram,
  options: { document?: Document } = {},
): Promise<() => void> {
  const bytes = await program.load();
  return mountFace(program.family, bytes, {
    ...options,
    weight: program.weight,
    style: program.style,
  });
}

/**
 * The programs one layer has mounted: each mounted once, however often it's
 * asked for, and all let go together when the layer goes (a program another
 * layer holds stays, refcounted per document). A mount after the release
 * holds again, for a layer that comes back (React's strict mode runs effects
 * twice).
 */
export function createFontMounts(options: { document?: Document } = {}) {
  const held = new Map<string, Promise<() => void>>();
  return {
    mount(programs: readonly MountableFontProgram[]): void {
      for (const program of programs) {
        if (held.has(program.family)) continue;
        held.set(
          program.family,
          mountFontProgram(program, options).catch(() => () => {}),
        );
      }
    },
    release(): void {
      for (const unmount of held.values()) void unmount.then((off) => off());
      held.clear();
    },
  };
}

interface Holder {
  face: FontFace;
  doc: Document;
  count: number;
}

const HOLDERS = new WeakMap<Document, Map<string, Holder>>();
const LISTENERS = new WeakMap<Document, Set<() => void>>();

/** Internal: refresh editor styles for CSS loads and explicitly mounted faces.
 * Adding an already loaded FontFace does not trigger `loadingdone`. */
export function observeWebFonts(doc: Document, onChange: () => void): () => void {
  let listeners = LISTENERS.get(doc);
  if (!listeners) {
    listeners = new Set();
    LISTENERS.set(doc, listeners);
  }
  listeners.add(onChange);
  doc.fonts?.addEventListener('loadingdone', onChange);
  doc.fonts?.addEventListener('loadingerror', onChange);
  return () => {
    listeners.delete(onChange);
    doc.fonts?.removeEventListener('loadingdone', onChange);
    doc.fonts?.removeEventListener('loadingerror', onChange);
  };
}

function notifyFontChange(doc: Document): void {
  for (const listener of LISTENERS.get(doc) ?? []) listener();
}

function holdersOf(doc: Document): Map<string, Holder> {
  let map = HOLDERS.get(doc);
  if (!map) {
    map = new Map();
    HOLDERS.set(doc, map);
  }
  return map;
}

function release(holders: Map<string, Holder>, family: string): void {
  const holder = holders.get(family);
  if (!holder) return;
  holder.count--;
  if (holder.count > 0) return;
  holders.delete(family);
  try {
    holder.doc.fonts.delete(holder.face);
  } catch {
    // a detached document: nothing to remove from
  }
  notifyFontChange(holder.doc);
}
