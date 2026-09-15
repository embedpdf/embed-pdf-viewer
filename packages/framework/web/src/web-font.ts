/**
 * Mount a registered font for the DOM: the engine lays text out with the
 * font's bytes, the browser needs the same face as a `@font-face` so the
 * live editor and the vector renderer show the glyphs the appearance stream
 * will bake. The family name is the font's KEY — the CSS family the
 * annotation plugin emits for a registered font (`cssFontFamily`) — so
 * mounting under the key is what makes the two agree.
 *
 * Returns the unmount. Idempotent per (document, key): a second mount of a
 * key already in the document's font set is a no-op that still returns an
 * unmount of its own (the face leaves when the LAST holder unmounts).
 */
export async function mountWebFont(
  key: string,
  data: ArrayBuffer | Uint8Array,
  options: { document?: Document; weight?: number | string; style?: 'normal' | 'italic' } = {},
): Promise<() => void> {
  const doc = options.document ?? document;
  const fonts = doc.fonts;
  if (!fonts || typeof FontFace === 'undefined') return () => {};
  const holders = holdersOf(doc);
  const existing = holders.get(key);
  if (existing) {
    existing.count++;
    return () => release(holders, key);
  }
  const buffer =
    data instanceof Uint8Array
      ? (data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer)
      : data;
  const face = new FontFace(key, buffer, {
    weight: options.weight !== undefined ? String(options.weight) : undefined,
    style: options.style,
  });
  holders.set(key, { face, doc, count: 1 });
  try {
    await face.load();
    fonts.add(face);
  } catch {
    holders.delete(key);
    return () => {};
  }
  return () => release(holders, key);
}

interface Holder {
  face: FontFace;
  doc: Document;
  count: number;
}

const HOLDERS = new WeakMap<Document, Map<string, Holder>>();

function holdersOf(doc: Document): Map<string, Holder> {
  let map = HOLDERS.get(doc);
  if (!map) {
    map = new Map();
    HOLDERS.set(doc, map);
  }
  return map;
}

function release(holders: Map<string, Holder>, key: string): void {
  const holder = holders.get(key);
  if (!holder) return;
  holder.count--;
  if (holder.count > 0) return;
  holders.delete(key);
  try {
    holder.doc.fonts.delete(holder.face);
  } catch {
    // a detached document: nothing to remove from
  }
}
