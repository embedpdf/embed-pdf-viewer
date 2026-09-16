import { afterEach, describe, expect, it, vi } from 'vitest';

import { mountWebFont } from './web-font';

/** A `Document` with a font set, and a `FontFace` that loads at once. */
function fakeDocument() {
  const faces = new Set<{ family: string }>();
  const doc = {
    fonts: {
      add: (face: { family: string }) => faces.add(face),
      delete: (face: { family: string }) => faces.delete(face),
    },
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
