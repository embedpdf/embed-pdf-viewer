import {
  buildSegmentQuadFromGlyphQuads,
  PdfGlyphSlim,
  PdfPageGeometry,
  PdfRun,
  rectToQuad,
} from '@embedpdf/models';
import { quadsWithinSlice } from '../utils';

function makeGlyph(
  index: number,
  x: number,
  width: number,
  matrix = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 },
): PdfGlyphSlim {
  const quad = rectToQuad({
    origin: { x, y: 0 },
    size: { width, height: 10 },
  });
  return {
    x,
    y: 0,
    width,
    height: 10,
    flags: 0,
    matrix,
    pageOrigin: { x, y: 0 },
    quad,
  };
}

function makeGeometry(glyphs: PdfGlyphSlim[]): PdfPageGeometry {
  const run: PdfRun = {
    rect: { x: 0, y: 0, width: 100, height: 10 },
    charStart: 0,
    glyphs,
    fontSize: 10,
  };
  return { runs: [run] };
}

describe('quadsWithinSlice', () => {
  test('builds one oriented segment quad for horizontal selection', () => {
    const geo = makeGeometry([makeGlyph(0, 0, 5), makeGlyph(1, 5, 5), makeGlyph(2, 10, 5)]);
    const { quads, rects } = quadsWithinSlice(geo, 0, 2, false);

    expect(quads).toHaveLength(1);
    expect(rects).toHaveLength(1);
    expect(rects[0].size.width).toBe(15);
    expect(quads[0].p1.x).toBe(0);
    expect(quads[0].p2.x).toBe(15);
  });

  test('splits segments when baseline direction changes', () => {
    const horizontal = makeGlyph(0, 0, 5);
    const verticalMatrix = { a: 0, b: 1, c: -1, d: 0, e: 0, f: 0 };
    const vertical = makeGlyph(1, 20, 5, verticalMatrix);
    vertical.quad = buildSegmentQuadFromGlyphQuads(
      rectToQuad({ origin: { x: 20, y: 0 }, size: { width: 10, height: 5 } }),
      rectToQuad({ origin: { x: 20, y: 0 }, size: { width: 10, height: 5 } }),
    );

    const geo = makeGeometry([horizontal, vertical]);
    const { quads } = quadsWithinSlice(geo, 0, 1, false);

    expect(quads.length).toBeGreaterThanOrEqual(2);
  });
});
