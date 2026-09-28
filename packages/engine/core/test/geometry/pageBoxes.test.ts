import { describe, expect, it } from 'vitest';

import { pdfRectIntersection } from '../../src/geometry/convert';
import { DEFAULT_MEDIA_BOX, pageBoxesOf } from '../../src/geometry/pageBoxes';

const rect = (left: number, bottom: number, right: number, top: number) => ({
  left,
  bottom,
  right,
  top,
});

describe('pageBoxesOf (ISO 32000-1 §14.11.2)', () => {
  it('defaults the crop box to the media box and the others to the crop box', () => {
    const media = rect(0, 0, 612, 792);
    const crop = rect(36, 36, 576, 756);
    expect(pageBoxesOf({ media })).toEqual({
      media,
      crop: media,
      bleed: media,
      trim: media,
      art: media,
    });
    expect(pageBoxesOf({ media, crop })).toEqual({
      media,
      crop,
      bleed: crop,
      trim: crop,
      art: crop,
    });
  });

  it('reduces every box to the part it shares with the media box', () => {
    const boxes = pageBoxesOf({
      media: rect(0, 0, 612, 792),
      crop: rect(300, 400, 900, 1000),
      bleed: rect(-10, -10, 700, 900),
    });
    expect(boxes.crop).toEqual(rect(300, 400, 612, 792));
    expect(boxes.bleed).toEqual(rect(0, 0, 612, 792));
    expect(boxes.trim).toEqual(rect(300, 400, 612, 792));
  });

  it('keeps a media box that starts at negative numbers', () => {
    const media = rect(-1685, -1192, 1685, 1192);
    expect(pageBoxesOf({ media }).crop).toEqual(media);
  });

  it('makes a page without a media box US Letter', () => {
    expect(pageBoxesOf({}).media).toEqual(DEFAULT_MEDIA_BOX);
    expect(pageBoxesOf({}).crop).toEqual(rect(0, 0, 612, 792));
  });

  it('treats a box that shares nothing with the media box as absent', () => {
    const media = rect(0, 0, 612, 792);
    const boxes = pageBoxesOf({
      media,
      crop: rect(700, 800, 900, 1000),
      art: rect(-50, 0, -10, 20),
    });
    expect(boxes.crop).toEqual(media);
    expect(boxes.art).toEqual(media);
  });
});

describe('pdfRectIntersection', () => {
  it('is the shared area, or null when there is none or only an edge', () => {
    expect(pdfRectIntersection(rect(0, 0, 10, 10), rect(5, 5, 20, 20))).toEqual(rect(5, 5, 10, 10));
    expect(pdfRectIntersection(rect(0, 0, 10, 10), rect(10, 0, 20, 10))).toBeNull();
    expect(pdfRectIntersection(rect(0, 0, 10, 10), rect(20, 20, 30, 30))).toBeNull();
  });
});
