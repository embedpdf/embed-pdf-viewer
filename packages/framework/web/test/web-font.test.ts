import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountWebFont, observeWebFonts } from '../src/web-font';

/** A `Document` with a font set, and a `FontFace` that loads at once. */
function fakeDocument() {
  const faces = new Set<{ family: string }>();
  const doc = {
    fonts: Object.assign(new EventTarget(), {
      add: (face: { family: string }) => faces.add(face),
      delete: (face: { family: string }) => faces.delete(face),
    }),
  } as unknown as Document;
  return { doc, faces };
}

class FakeFontFace {
  status = 'unloaded';
  constructor(
    public family: string,
    public source: ArrayBuffer,
    public descriptors?: { weight?: string; style?: string },
  ) {}
  async load() {
    this.status = 'loaded';
    return this;
  }
}

afterEach(() => vi.unstubAllGlobals());

describe('mountWebFont', () => {
  it('notifies only the owning document on mounts, final unmounts and CSS loads', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc } = fakeDocument();
    const other = fakeDocument().doc;
    const changed = vi.fn();
    const otherChanged = vi.fn();
    const stop = observeWebFonts(doc, changed);
    const stopOther = observeWebFonts(other, otherChanged);
    const first = await mountWebFont('brand-sans', new Uint8Array([1]), { document: doc });
    const second = await mountWebFont('brand-sans', new Uint8Array([1]), { document: doc });
    expect(changed).toHaveBeenCalledTimes(1);
    first();
    expect(changed).toHaveBeenCalledTimes(1);
    second();
    expect(changed).toHaveBeenCalledTimes(2);
    doc.fonts.dispatchEvent(new Event('loadingdone'));
    doc.fonts.dispatchEvent(new Event('loadingerror'));
    expect(changed).toHaveBeenCalledTimes(4);
    expect(otherChanged).not.toHaveBeenCalled();
    stop();
    doc.fonts.dispatchEvent(new Event('loadingdone'));
    const unmount = await mountWebFont('brand-sans', new Uint8Array([1]), { document: doc });
    unmount();
    expect(changed).toHaveBeenCalledTimes(4);
    stopOther();
  });
  it('mounts the bytes as a @font-face named by the key, refcounted per document', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc, faces } = fakeDocument();
    const data = new Uint8Array([1, 2, 3]);
    const first = await mountWebFont('brand-sans', data, { document: doc, weight: 700 });
    const face = [...faces][0] as unknown as FakeFontFace;
    expect(face.family).toBe('brand-sans');
    expect(face.descriptors?.weight).toBe('700');
    expect(face.status).toBe('loaded');
    // A second mount of the same key adds nothing and holds its own reference.
    const second = await mountWebFont('brand-sans', data, { document: doc });
    expect(faces.size).toBe(1);
    first();
    expect(faces.size).toBe(1); // the second holder keeps it
    second();
    expect(faces.size).toBe(0);
  });

  it('is a no-op without the FontFace API', async () => {
    const { doc, faces } = fakeDocument();
    const unmount = await mountWebFont('x', new Uint8Array([0]), { document: doc });
    expect(faces.size).toBe(0);
    expect(() => unmount()).not.toThrow();
  });
});
