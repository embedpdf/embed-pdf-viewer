import { describe, expect, test } from 'vitest';
import type { PageLayout } from '@embedpdf/core';
import { destinationToReveal } from '../src/destination';

/** US Letter, crop at origin — content space equals PDF space with y flipped. */
const letter: PageLayout = {
  index: 3,
  pageObjectNumber: 12,
  label: null,
  size: { width: 612, height: 792 },
  rotation: 0,
  userUnit: 1,
  boxes: {
    media: { left: 0, bottom: 0, right: 612, top: 792 },
    crop: { left: 0, bottom: 0, right: 612, top: 792 },
  },
};

/** Same page with an offset crop box (the conversion must be crop-relative). */
const cropped: PageLayout = {
  ...letter,
  size: { width: 600, height: 780 },
  boxes: {
    media: { left: 0, bottom: 0, right: 612, top: 792 },
    crop: { left: 10, bottom: 8, right: 610, top: 788 },
  },
};

describe('destinationToReveal', () => {
  test('/XYZ: point at upper-left, explicit zoom', () => {
    const { pageIndex, options } = destinationToReveal(
      { kind: 'xyz', pageObjectNumber: 12, left: 100, top: 700, zoom: 1.5 },
      letter,
    );
    expect(pageIndex).toBe(3);
    expect(options.rect).toEqual({ x: 100, y: 92, width: 0, height: 0 }); // y = 792 - 700
    expect(options.anchor).toEqual({ x: 'start', y: 'start' });
    expect(options.zoom).toEqual({ level: 1.5 });
  });

  test('/XYZ: null coordinates keep their axes; zoom 0 means keep', () => {
    const { options } = destinationToReveal(
      { kind: 'xyz', pageObjectNumber: 12, left: null, top: 700, zoom: 0 },
      letter,
    );
    expect(options.anchor).toEqual({ x: 'keep', y: 'start' });
    expect(options.zoom).toBe('keep');
  });

  test('/Fit: whole page, fit zoom, centered by default', () => {
    const { options } = destinationToReveal({ kind: 'fit', pageObjectNumber: 12 }, letter);
    expect(options).toEqual({ zoom: 'fit' });
  });

  test('/FitH: page-wide strip at top coordinate, width fit', () => {
    const { options } = destinationToReveal(
      { kind: 'fitH', pageObjectNumber: 12, top: 700 },
      letter,
    );
    expect(options.rect).toEqual({ x: 0, y: 92, width: 612, height: 0 });
    expect(options.zoom).toBe('fit-width');
    expect(options.anchor).toEqual({ y: 'start' });
  });

  test('/FitH with null top keeps the vertical axis', () => {
    const { options } = destinationToReveal({ kind: 'fitH', pageObjectNumber: 12 }, letter);
    expect(options.anchor).toEqual({ y: 'keep' });
  });

  test('/FitV mirrors FitH on the other axis', () => {
    const { options } = destinationToReveal(
      { kind: 'fitV', pageObjectNumber: 12, left: 150 },
      letter,
    );
    expect(options.rect).toEqual({ x: 150, y: 0, width: 0, height: 792 });
    expect(options.zoom).toBe('fit-height');
    expect(options.anchor).toEqual({ x: 'start' });
  });

  test('/FitR: the rect, fully fitted', () => {
    const { options } = destinationToReveal(
      { kind: 'fitR', pageObjectNumber: 12, left: 100, bottom: 500, right: 300, top: 700 },
      letter,
    );
    expect(options.rect).toEqual({ x: 100, y: 92, width: 200, height: 200 });
    expect(options.zoom).toBe('fit');
  });

  test('/FitB* uses the bounding box when provided, crop fallback otherwise', () => {
    const bbox = { x: 50, y: 60, width: 400, height: 500 };
    const withBox = destinationToReveal({ kind: 'fitB', pageObjectNumber: 12 }, letter, bbox);
    expect(withBox.options).toEqual({ rect: bbox, zoom: 'fit' });
    const fallback = destinationToReveal({ kind: 'fitB', pageObjectNumber: 12 }, letter);
    expect(fallback.options.rect).toEqual({ x: 0, y: 0, width: 612, height: 792 });

    const bh = destinationToReveal({ kind: 'fitBH', pageObjectNumber: 12, top: 700 }, letter, bbox);
    expect(bh.options.rect).toEqual({ x: 50, y: 92, width: 400, height: 0 });
    expect(bh.options.zoom).toBe('fit-width');
  });

  test('coordinates are crop-relative (offset crop box)', () => {
    const { options } = destinationToReveal(
      { kind: 'xyz', pageObjectNumber: 12, left: 100, top: 700, zoom: null },
      cropped,
    );
    // x = left - crop.left = 90; y = crop.top - top = 788 - 700 = 88
    expect(options.rect).toEqual({ x: 90, y: 88, width: 0, height: 0 });
  });
});
