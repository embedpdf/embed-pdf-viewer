import { describe, expect, test } from 'vitest';

import type { PageLayout } from '../../src/dto/PageLayout';
import { pdfRectOf } from '../../src/geometry/pageSpace';
import type { PdfRect } from '../../src/geometry/primitives';
import { toPageRef } from '../../src/identity/PageRef';
import { pdfWidgetPlacementOf } from '../../src/pageSpace/forms';
import { pageViewportsOf, pdfMeasureOf } from '../../src/pageSpace/measure';
import { pageListOf, pageSpaceBoxesOf, visibleBoxesOf } from '../../src/pageSpace/pages';
import { pageAppearancesOf, pdfRenderTargetOf } from '../../src/pageSpace/rendering';

const media: PdfRect = { left: 0, bottom: 0, right: 612, top: 792 };
const crop: PdfRect = { left: 50, bottom: 60, right: 562, top: 732 };
const boxes = {
  media,
  crop,
  bleed: crop,
  trim: { left: 60, bottom: 70, right: 552, top: 722 },
  art: crop,
};

const layout = (pageObjectNumber: number, visible: PdfRect): PageLayout => ({
  index: 0,
  ref: toPageRef(pageObjectNumber),
  label: null,
  size: { width: visible.right - visible.left, height: visible.top - visible.bottom },
  rotation: 0,
  userUnit: 1,
  boxes: { media: visible, crop: visible, bleed: visible, trim: visible, art: visible },
});

describe('pages in page space', () => {
  test('the crop box is the page; the others are measured from its top-left', () => {
    expect(pageSpaceBoxesOf(boxes)).toEqual({
      media: { x: -50, y: -60, width: 612, height: 792 },
      crop: { x: 0, y: 0, width: 512, height: 672 },
      bleed: { x: 0, y: 0, width: 512, height: 672 },
      trim: { x: 10, y: 10, width: 492, height: 652 },
      art: { x: 0, y: 0, width: 512, height: 672 },
    });
  });

  test('a page in page space keeps where it sits in PDF space, for PDF tools', () => {
    const page = { ...layout(4, media), boxes };
    const [converted] = pageListOf({ pageCount: 1, pages: [page], namedPages: [] }).pages;
    expect(converted!.pdfCropBox).toEqual(crop);
    expect(converted!.boxes.crop).toEqual({ x: 0, y: 0, width: 512, height: 672 });
    expect(pdfRectOf({ x: 50, y: 82, width: 50, height: 50 }, converted!.pdfCropBox)).toEqual({
      left: 100,
      right: 150,
      bottom: 600,
      top: 650,
    });
  });

  test("a page's action goes to another page, measured there", () => {
    const first = {
      ...layout(4, crop),
      actions: {
        open: {
          incomplete: false,
          warningFlags: 0,
          warnings: [],
          root: {
            subtype: 'GoTo',
            type: 'goto' as const,
            destination: { kind: 'fitH' as const, page: toPageRef(6), top: 300 },
            next: [],
          },
        },
      },
    };
    const second = layout(6, { left: -306, bottom: -396, right: 306, top: 396 });
    const list = pageListOf({ pageCount: 2, pages: [first, second], namedPages: [] });
    expect(list.pages[0]!.actions?.open?.root).toMatchObject({
      destination: { kind: 'fitH', y: 96 },
    });
    expect(() => visibleBoxesOf([first])(toPageRef(99))).toThrow();
  });
});

describe('render, form and measure values', () => {
  test('a render target and appearance rects', () => {
    expect(
      pdfRenderTargetOf({ kind: 'rect', rect: { x: 50, y: 82, width: 50, height: 50 } }, crop),
    ).toEqual({ kind: 'rect', rect: { left: 100, right: 150, bottom: 600, top: 650 } });
    expect(pdfRenderTargetOf({ kind: 'page' }, crop)).toEqual({ kind: 'page' });
    const result = pageAppearancesOf(
      {
        pageState: {} as never,
        appearances: [
          {
            ref: {} as never,
            mode: 'normal',
            rect: { left: 100, bottom: 600, right: 150, top: 650 },
            raster: {} as never,
          },
        ],
      },
      crop,
    );
    expect(result.appearances[0]!.rect).toEqual({ x: 50, y: 82, width: 50, height: 50 });
  });

  test('a widget is placed on its own page', () => {
    const boxOf = visibleBoxesOf([layout(4, crop)]);
    expect(
      pdfWidgetPlacementOf(
        { page: toPageRef(4), rect: { x: 50, y: 82, width: 50, height: 50 } },
        boxOf,
      ),
    ).toEqual({ page: toPageRef(4), rect: { left: 100, right: 150, bottom: 600, top: 650 } });
  });

  test('a viewport and a scale origin', () => {
    const [viewport] = pageViewportsOf(
      [
        {
          bbox: crop,
          name: 'plan',
          owned: true,
          measure: {
            subtype: 'rectilinear',
            x: [],
            distance: [],
            area: [],
            origin: { x: 50, y: 732 },
          },
        },
      ],
      crop,
    );
    expect(viewport).toMatchObject({
      bbox: { x: 0, y: 0, width: 512, height: 672 },
      measure: { origin: { x: 0, y: 0 } },
    });
    expect(
      pdfMeasureOf(
        { subtype: 'rectilinear', x: [], distance: [], area: [], origin: { x: 0, y: 0 } },
        crop,
      ),
    ).toMatchObject({ origin: { x: 50, y: 732 } });
    expect(pdfMeasureOf({ subtype: 'geospatial' }, crop)).toEqual({ subtype: 'geospatial' });
  });
});
