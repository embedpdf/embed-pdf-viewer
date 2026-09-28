import { describe, expect, test } from 'vitest';

import type { AnnotationDTO } from '../../src/annotation/kinds';
import type { PdfRect } from '../../src/geometry/primitives';
import { toPageRef } from '../../src/identity/PageRef';
import {
  pageAnnotationOf,
  pdfAnnotationOf,
  pdfAnnotationDraftOf,
  pdfAnnotationPatchOf,
} from '../../src/pageSpace/annotations';
import type { PdfCoordinates } from '../../src/pageSpace/coordinates';

const PAGE = toPageRef(4);
const OTHER = toPageRef(6);
const visible: PdfRect = { left: 50, bottom: 60, right: 562, top: 732 };
const boxes = new Map<number, PdfRect>([
  [4, visible],
  [6, { left: -300, bottom: -390, right: 300, top: 390 }],
]);
const boxOf = (page: { pageObjectNumber: number }) => boxes.get(page.pageObjectNumber)!;

/** Only the fields a test looks at; the codec leaves every other field alone. */
const read = (value: object) => value as unknown as AnnotationDTO<PdfCoordinates>;

describe('annotations in page space', () => {
  test('a box kind: rect and box become boxes, everything else stays', () => {
    const square = read({
      subtype: 'square',
      page: PAGE,
      rect: { left: 95, bottom: 595, right: 155, top: 655 },
      box: { left: 100, bottom: 600, right: 150, top: 650 },
      rotation: 30,
      color: { r: 255, g: 0, b: 0 },
      strokeWidth: 5,
      actions: null,
    });
    const page = pageAnnotationOf(square, visible, boxOf);
    expect(page).toMatchObject({
      page: PAGE,
      rect: { x: 45, y: 77, width: 60, height: 60 },
      box: { x: 50, y: 82, width: 50, height: 50 },
      rotation: 30,
      color: { r: 255, g: 0, b: 0 },
      strokeWidth: 5,
      actions: null,
    });
    expect(pdfAnnotationOf(page, visible, boxOf)).toEqual(square);
  });

  test('points, strokes, quads, line ends and callouts are measured on the page', () => {
    const cases = [
      read({
        subtype: 'polygon',
        vertices: [
          { x: 50, y: 732 },
          { x: 150, y: 632 },
        ],
        captionCenter: null,
      }),
      read({
        subtype: 'ink',
        inkList: [
          [{ x: 60, y: 722 }],
          [
            { x: 70, y: 712 },
            { x: 80, y: 702 },
          ],
        ],
      }),
      read({
        subtype: 'highlight',
        quadPoints: [
          {
            p1: { x: 50, y: 732 },
            p2: { x: 150, y: 732 },
            p3: { x: 50, y: 712 },
            p4: { x: 150, y: 712 },
          },
        ],
      }),
      read({ subtype: 'line', linePoints: { start: { x: 50, y: 732 }, end: { x: 150, y: 632 } } }),
      read({
        subtype: 'free-text',
        calloutLine: [
          { x: 50, y: 732 },
          { x: 150, y: 632 },
        ],
      }),
    ];
    const pages = cases.map((annotation) => pageAnnotationOf(annotation, visible, boxOf));
    expect(pages[0]).toMatchObject({
      vertices: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
      captionCenter: null,
    });
    expect(pages[1]).toMatchObject({
      inkList: [
        [{ x: 10, y: 10 }],
        [
          { x: 20, y: 20 },
          { x: 30, y: 30 },
        ],
      ],
    });
    expect(pages[2]).toMatchObject({
      quadPoints: [
        { p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, p3: { x: 0, y: 20 }, p4: { x: 100, y: 20 } },
      ],
    });
    expect(pages[3]).toMatchObject({
      linePoints: { start: { x: 0, y: 0 }, end: { x: 100, y: 100 } },
    });
    expect(pages[4]).toMatchObject({
      calloutLine: [
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ],
    });
    pages.forEach((page, i) => expect(pdfAnnotationOf(page, visible, boxOf)).toEqual(cases[i]));
  });

  test("an icon's rect is a box like any other", () => {
    const note = read({ subtype: 'text', rect: { left: 72, bottom: 700, right: 92, top: 720 } });
    const page = pageAnnotationOf(note, visible, boxOf);
    expect(page).toMatchObject({ rect: { x: 22, y: 12, width: 20, height: 20 } });
    expect(pdfAnnotationOf(page, visible, boxOf)).toEqual(note);
  });

  test("a measurement's origin converts; its caption offset and leader don't", () => {
    const line = read({
      subtype: 'line',
      measure: { subtype: 'rectilinear', x: [], distance: [], area: [], origin: { x: 50, y: 732 } },
      captionOffset: { along: 5, perpendicular: -3 },
      leader: { length: 10 },
    });
    expect(pageAnnotationOf(line, visible, boxOf)).toMatchObject({
      measure: { origin: { x: 0, y: 0 } },
      captionOffset: { along: 5, perpendicular: -3 },
      leader: { length: 10 },
    });
  });

  test('rich text margins are sizes, not places', () => {
    const margins = { top: 1, bottom: 2, left: 3, right: 4 };
    const freeText = read({ subtype: 'free-text', richText: { paragraphs: [], margins } });
    expect(pageAnnotationOf(freeText, visible, boxOf)).toMatchObject({ richText: { margins } });
  });

  test("a link's destination is measured on the page it goes to", () => {
    const link = read({
      subtype: 'link',
      target: { kind: 'goto', destination: { kind: 'xyz', page: OTHER, left: -250, top: 350 } },
      actions: {
        activate: {
          incomplete: false,
          warningFlags: 0,
          warnings: [],
          root: {
            subtype: 'GoTo',
            type: 'goto',
            destination: { kind: 'fitH', page: PAGE, top: 700 },
            next: [],
          },
        },
      },
    });
    const page = pageAnnotationOf(link, visible, boxOf);
    expect(page).toMatchObject({
      target: { destination: { kind: 'xyz', page: OTHER, x: 50, y: 40 } },
      actions: { activate: { root: { destination: { kind: 'fitH', page: PAGE, y: 32 } } } },
    });
    expect(pdfAnnotationOf(page, visible, boxOf)).toEqual(link);
  });

  test("an update's fields convert by their names; only the fields it sends convert", () => {
    expect(
      pdfAnnotationPatchOf(
        {
          box: { x: 50, y: 82, width: 50, height: 50 },
          rotation: null,
          color: { r: 0, g: 0, b: 0 },
        },
        visible,
        boxOf,
      ),
    ).toEqual({
      box: { left: 100, right: 150, bottom: 600, top: 650 },
      rotation: null,
      color: { r: 0, g: 0, b: 0 },
    });
  });

  test('a place not given in page space is refused, naming the field', () => {
    expect(() =>
      pdfAnnotationDraftOf(
        { subtype: 'square', box: { left: 100, bottom: 600, right: 150, top: 650 } } as never,
        visible,
        boxOf,
      ),
    ).toThrow(expect.objectContaining({ code: 'InvalidArg', details: { field: 'box' } }));
  });
});
