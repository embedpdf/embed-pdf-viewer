import { afterEach, describe, expect, it, vi } from 'vitest';

import { createFontMounts, mountFontProgram, observeWebFonts } from '../src/web-font';

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

/** A regular program under `family`, with these bytes. */
const programOf = (family: string, bytes: Uint8Array, weight = 400) => ({
  family,
  weight,
  style: 'normal' as const,
  load: async () => bytes,
});

describe('mountFontProgram', () => {
  it('notifies only the owning document on mounts, final unmounts and CSS loads', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc } = fakeDocument();
    const other = fakeDocument().doc;
    const changed = vi.fn();
    const otherChanged = vi.fn();
    const stop = observeWebFonts(doc, changed);
    const stopOther = observeWebFonts(other, otherChanged);
    const program = programOf('epdf-0123456789abcdef', new Uint8Array([1]));
    const first = await mountFontProgram(program, { document: doc });
    const second = await mountFontProgram(program, { document: doc });
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
    const unmount = await mountFontProgram(program, { document: doc });
    unmount();
    expect(changed).toHaveBeenCalledTimes(4);
    stopOther();
  });
  it('mounts the bytes as a @font-face under the program’s family, refcounted per document', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc, faces } = fakeDocument();
    const program = programOf('epdf-0123456789abcdef', new Uint8Array([1, 2, 3]), 700);
    const first = await mountFontProgram(program, { document: doc });
    const face = [...faces][0] as unknown as FakeFontFace;
    expect(face.family).toBe('epdf-0123456789abcdef');
    expect(face.descriptors?.weight).toBe('700');
    expect(face.status).toBe('loaded');
    // A second mount of the same program adds nothing and holds its own reference.
    const second = await mountFontProgram(program, { document: doc });
    expect(faces.size).toBe(1);
    first();
    expect(faces.size).toBe(1); // the second holder keeps it
    second();
    expect(faces.size).toBe(0);
  });

  it('mounts a program under its family, in its own weight and style', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc, faces } = fakeDocument();
    const load = vi.fn(async () => new Uint8Array([4, 5]));
    const program = {
      family: 'epdf-0123456789abcdef',
      weight: 700,
      style: 'italic' as const,
      load,
    };
    const unmount = await mountFontProgram(program, { document: doc });
    const face = [...faces][0] as unknown as FakeFontFace;
    expect([face.family, face.descriptors]).toEqual([
      'epdf-0123456789abcdef',
      { weight: '700', style: 'italic' },
    ]);
    expect([...new Uint8Array(face.source)]).toEqual([4, 5]);
    unmount();
    expect(faces.size).toBe(0);
  });

  it('mounts each program a layer asks for once, and lets them all go together', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc, faces } = fakeDocument();
    const program = (family: string) => ({
      family,
      weight: 400,
      style: 'normal' as const,
      load: vi.fn(async () => new Uint8Array([1])),
    });
    const sans = program('epdf-aaaaaaaaaaaaaaaa');
    const serif = program('epdf-bbbbbbbbbbbbbbbb');
    const mounts = createFontMounts({ document: doc });
    mounts.mount([sans]);
    mounts.mount([sans, serif]);
    await vi.waitFor(() => expect(faces.size).toBe(2));
    expect(sans.load).toHaveBeenCalledTimes(1);
    mounts.release();
    await vi.waitFor(() => expect(faces.size).toBe(0));
    // A layer that comes back holds again.
    mounts.mount([sans]);
    await vi.waitFor(() => expect(faces.size).toBe(1));
    expect(sans.load).toHaveBeenCalledTimes(2);
  });

  it('rejects a program the browser refuses, and holds nothing of it', async () => {
    class RefusedFontFace extends FakeFontFace {
      override async load(): Promise<this> {
        throw new DOMException('Invalid font data in ArrayBuffer.');
      }
    }
    vi.stubGlobal('FontFace', RefusedFontFace);
    const { doc, faces } = fakeDocument();
    const program = {
      family: 'epdf-0123456789abcdef',
      weight: 400,
      style: 'normal' as const,
      load: async () => new Uint8Array([1]),
    };
    await expect(mountFontProgram(program, { document: doc })).rejects.toThrow('Invalid font data');
    expect(faces.size).toBe(0);
    // Asked again, it's tried again.
    await expect(mountFontProgram(program, { document: doc })).rejects.toThrow();
  });

  it('is a no-op without the FontFace API', async () => {
    const { doc, faces } = fakeDocument();
    const unmount = await mountFontProgram(programOf('epdf-x', new Uint8Array([0])), {
      document: doc,
    });
    expect(faces.size).toBe(0);
    expect(() => unmount()).not.toThrow();
  });
});
