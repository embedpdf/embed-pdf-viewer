/**
 * The fonts a typed signature is drawn in: three handwriting fonts by default, each read only
 * when asked for; an app's `plugins.signature.fonts` in their place, from a URL or bytes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { markFontsOf } from '../../../chrome/src/ui/signature-fonts';

/** The first four bytes of a TrueType file. */
const TRUETYPE = [0x00, 0x01, 0x00, 0x00];

afterEach(() => vi.unstubAllGlobals());

describe('markFontsOf', () => {
  it('offers Allura, Great Vibes and Caveat by default, each read as a TrueType file', async () => {
    const fonts = markFontsOf(undefined);
    expect(fonts.map((font) => [font.key, font.label])).toEqual([
      ['allura', 'Allura'],
      ['great-vibes', 'Great Vibes'],
      ['caveat', 'Caveat'],
    ]);
    for (const font of fonts) expect([...(await font.bytes()).slice(0, 4)]).toEqual(TRUETYPE);
  });

  it("offers the app's fonts in place of the default ones, from bytes or a URL", async () => {
    const fetched: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        fetched.push(url);
        return new Response(new Uint8Array([1, 2, 3]));
      }),
    );
    const fonts = markFontsOf([
      { key: 'brand', label: 'Brand', data: new Uint8Array([9, 8]) },
      { key: 'remote', label: 'Remote', url: '/fonts/remote.ttf' },
    ]);
    expect(fonts.map((font) => font.label)).toEqual(['Brand', 'Remote']);
    expect([...(await fonts[0]!.bytes())]).toEqual([9, 8]);
    expect(fetched).toEqual([]);
    expect([...(await fonts[1]!.bytes())]).toEqual([1, 2, 3]);
    expect(fetched).toEqual(['/fonts/remote.ttf']);
  });

  it('offers no font for an empty list', () => {
    expect(markFontsOf([])).toEqual([]);
  });
});
