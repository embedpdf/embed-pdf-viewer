import { afterEach, describe, expect, it, vi } from 'vitest';

import { browserTextMeasurer } from '../src/text-measurer';

class FakeFontFace {
  constructor(
    public family: string,
    public source: ArrayBuffer,
    public descriptors?: { weight?: string; style?: string },
  ) {}
  async load() {
    return this;
  }
}

/** A `Document` with a font set and a canvas whose text is 500 wide per character. */
function fakeDocument() {
  const faces = new Set<FakeFontFace>();
  const measured: { font: string; direction: string; text: string }[] = [];
  const context = {
    font: '',
    direction: 'ltr',
    measureText(text: string) {
      measured.push({ font: this.font, direction: this.direction, text });
      return { width: [...text].length * 500 };
    },
  };
  const doc = {
    fonts: Object.assign(new EventTarget(), {
      add: (face: FakeFontFace) => faces.add(face),
      delete: (face: FakeFontFace) => faces.delete(face),
    }),
    createElement: () => ({ getContext: () => context }),
  } as unknown as Document;
  return { doc, faces, measured };
}

const program = (load = vi.fn(async () => new Uint8Array([1]))) => ({
  family: 'epdf-0123456789abcdef',
  weight: 700,
  style: 'italic' as const,
  load,
});

afterEach(() => vi.unstubAllGlobals());

describe('browserTextMeasurer', () => {
  it('mounts a program the first time it is asked about, and says when it is ready', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc, faces } = fakeDocument();
    const measurer = browserTextMeasurer({ document: doc });
    const ready = vi.fn();
    measurer.onReady(ready);
    const hebrew = program();
    expect(measurer.ready(hebrew)).toBe(false);
    expect(measurer.ready(hebrew)).toBe(false);
    await vi.waitFor(() => expect(ready).toHaveBeenCalledTimes(1));
    expect(measurer.ready(hebrew)).toBe(true);
    expect(hebrew.load).toHaveBeenCalledTimes(1);
    expect([...faces].map((face) => [face.family, face.descriptors])).toEqual([
      ['epdf-0123456789abcdef', { weight: '700', style: 'italic' }],
    ]);
  });

  it('asks again for bytes that did not load', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc } = fakeDocument();
    const measurer = browserTextMeasurer({ document: doc });
    const load = vi.fn(async () => new Uint8Array([1]));
    load.mockRejectedValueOnce(new Error('offline'));
    const flaky = program(load);
    expect(measurer.ready(flaky)).toBe(false);
    await vi.waitFor(() => expect(load).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(measurer.ready(flaky)).toBe(false);
    await vi.waitFor(() => expect(measurer.ready(flaky)).toBe(true));
    expect(load).toHaveBeenCalledTimes(2);
  });

  it('measures in the program, in its style, at a size whose pixels are thousandths of an em', () => {
    const { doc, measured } = fakeDocument();
    const measurer = browserTextMeasurer({ document: doc });
    expect(measurer.width(program(), 'שלום', true)).toBe(2000);
    expect(measurer.width(program(), 'ab', false)).toBe(1000);
    expect(measured).toEqual([
      { font: 'italic 700 1000px "epdf-0123456789abcdef"', direction: 'rtl', text: 'שלום' },
      { font: 'italic 700 1000px "epdf-0123456789abcdef"', direction: 'ltr', text: 'ab' },
    ]);
  });

  it('stops telling a listener once it unsubscribes', async () => {
    vi.stubGlobal('FontFace', FakeFontFace);
    const { doc } = fakeDocument();
    const measurer = browserTextMeasurer({ document: doc });
    const ready = vi.fn();
    measurer.onReady(ready)();
    measurer.ready(program());
    await vi.waitFor(() => expect(measurer.ready(program())).toBe(true));
    expect(ready).not.toHaveBeenCalled();
  });
});
