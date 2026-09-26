import { describe, expect, it } from 'vitest';
import { pageSpace } from '../src/page-space';

/**
 * One owner of page ↔ PDF conversion, correct under a CropBox whose
 * origin is not (0, 0).
 */
describe('pageSpace', () => {
  const crop = { left: 10, bottom: 20, right: 210, top: 320 };
  const space = pageSpace(crop);

  it('reports the crop and page size', () => {
    expect(space.width).toBe(200);
    expect(space.height).toBe(300);
  });

  it('converts points both ways with the crop offset applied', () => {
    expect(space.pdfToPage({ x: 40, y: 280 })).toEqual({ x: 30, y: 40 });
    expect(space.pageToPdf({ x: 30, y: 40 })).toEqual({ x: 40, y: 280 });
  });

  it('converts rectangles both ways', () => {
    const pdf = space.pageRectToPdf({ x: 30, y: 40, width: 20, height: 10 });
    expect(pdf).toEqual({ left: 40, bottom: 270, right: 60, top: 280 });
    expect(space.pdfRectToPage(pdf)).toEqual({ x: 30, y: 40, width: 20, height: 10 });
  });

  it('converts quads both ways', () => {
    const quad = {
      p1: { x: 40, y: 280 },
      p2: { x: 60, y: 280 },
      p3: { x: 60, y: 270 },
      p4: { x: 40, y: 270 },
    };
    const page = space.pdfQuadToPage(quad);
    expect(page.p1).toEqual({ x: 30, y: 40 });
    expect(page.p3).toEqual({ x: 50, y: 50 });
    expect(space.pageQuadToPdf(page)).toEqual(quad);
  });

  it('handles a negative crop origin', () => {
    const offsetSpace = pageSpace({ left: -50, bottom: -100, right: 150, top: 200 });
    expect(offsetSpace.pdfToPage({ x: -50, y: 200 })).toEqual({ x: 0, y: 0 });
    expect(offsetSpace.pdfToPage({ x: 150, y: -100 })).toEqual({ x: 200, y: 300 });
  });
});
