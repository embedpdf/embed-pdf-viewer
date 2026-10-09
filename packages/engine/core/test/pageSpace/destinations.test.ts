import { describe, expect, test } from 'vitest';

import type { DocumentActionsSnapshot, PdfActionTree } from '../../src/dto/PdfAction';
import type { PageDestination, PdfDestination } from '../../src/dto/PdfDestination';
import type { PdfRect } from '../../src/geometry/primitives';
import { toPageRef } from '../../src/identity/PageRef';
import {
  mapActionTree,
  mapDocumentActions,
  mapLinkTarget,
  pageDestinationOf,
  pdfDestinationOf,
} from '../../src/pageSpace/destinations';

const A = toPageRef(4);
const B = toPageRef(6);
const boxes = new Map<number, PdfRect>([
  [4, { left: 0, bottom: 0, right: 612, top: 792 }],
  [6, { left: -300, bottom: -390, right: 300, top: 390 }],
]);
const boxOf = (page: { objectNumber: number }) => boxes.get(page.objectNumber)!;

describe('destinations in page space', () => {
  const cases: Array<[PdfDestination, PageDestination]> = [
    [
      { kind: 'xyz', page: B, left: -250, top: 350, zoom: 0 },
      { kind: 'xyz', page: B, x: 50, y: 40, zoom: 0 },
    ],
    [
      { kind: 'xyz', page: B, left: null, top: null, zoom: null },
      { kind: 'xyz', page: B, x: null, y: null, zoom: null },
    ],
    [
      { kind: 'xyz', page: B },
      { kind: 'xyz', page: B },
    ],
    [
      { kind: 'fitH', page: A, top: 700 },
      { kind: 'fitH', page: A, y: 92 },
    ],
    [
      { kind: 'fitV', page: A, left: 30 },
      { kind: 'fitV', page: A, x: 30 },
    ],
    [
      { kind: 'fitBH', page: B, top: null },
      { kind: 'fitBH', page: B, y: null },
    ],
    [
      { kind: 'fitBV', page: B, left: 0 },
      { kind: 'fitBV', page: B, x: 300 },
    ],
    [
      { kind: 'fitR', page: B, left: -200, bottom: -100, right: 100, top: 300 },
      { kind: 'fitR', page: B, x: 100, y: 90, width: 300, height: 400 },
    ],
    [
      { kind: 'fit', page: A },
      { kind: 'fit', page: A },
    ],
    [
      { kind: 'fitB', page: B },
      { kind: 'fitB', page: B },
    ],
  ];

  test.each(cases)('%o is measured on its own page', (pdf, page) => {
    expect(pageDestinationOf(pdf, boxOf)).toEqual(page);
    expect(pdfDestinationOf(page, boxOf)).toEqual(pdf);
  });

  test('a fitR given by its other corners comes out upright', () => {
    expect(
      pageDestinationOf(
        { kind: 'fitR', page: A, left: 200, bottom: 700, right: 100, top: 600 },
        boxOf,
      ),
    ).toEqual({ kind: 'fitR', page: A, x: 100, y: 92, width: 100, height: 100 });
  });

  test("the box can be the target page's own, instead of a lookup", () => {
    const destination: PdfDestination = { kind: 'xyz', page: B, left: -250, top: 350, zoom: 0 };
    const box = boxes.get(6)!;
    expect(pageDestinationOf(destination, box)).toEqual(pageDestinationOf(destination, boxOf));
    expect(pdfDestinationOf(pageDestinationOf(destination, box), box)).toEqual(destination);
  });

  test('a null or absent axis is kept, never measured', () => {
    const page = pageDestinationOf({ kind: 'xyz', page: A, top: 500 }, boxOf);
    expect(page).toEqual({ kind: 'xyz', page: A, y: 292 });
    expect('x' in page).toBe(false);
  });
});

describe('values that carry destinations', () => {
  const toPage = (destination: PdfDestination) => pageDestinationOf(destination, boxOf);

  test('a link target converts only a goto', () => {
    expect(mapLinkTarget({ kind: 'uri', uri: 'https://x' }, toPage)).toEqual({
      kind: 'uri',
      uri: 'https://x',
    });
    expect(
      mapLinkTarget({ kind: 'goto', destination: { kind: 'fitH', page: A, top: 700 } }, toPage),
    ).toEqual({ kind: 'goto', destination: { kind: 'fitH', page: A, y: 92 } });
  });

  test('every goto in an action tree converts, down its next chain', () => {
    const tree: PdfActionTree<PdfDestination> = {
      incomplete: false,
      warningFlags: 0,
      warnings: [],
      root: {
        subtype: 'GoTo',
        type: 'goto',
        destination: { kind: 'fitH', page: A, top: 700 },
        next: [
          { subtype: 'URI', type: 'uri', uri: 'https://x', isMap: false, next: [] },
          {
            subtype: 'GoTo',
            type: 'goto',
            destination: { kind: 'xyz', page: B, left: -250, top: 350 },
            next: [],
          },
        ],
      },
    };
    const page = mapActionTree(tree, toPage);
    expect(page.root).toMatchObject({
      destination: { kind: 'fitH', page: A, y: 92 },
      next: [{ type: 'uri' }, { destination: { kind: 'xyz', page: B, x: 50, y: 40 } }],
    });
  });

  test("a document's open destination and triggers convert", () => {
    const snapshot: DocumentActionsSnapshot<PdfDestination> = {
      nameTreeScripts: [],
      openAction: null,
      openDestination: { kind: 'xyz', page: B, left: -250, top: 350 },
    };
    expect(mapDocumentActions(snapshot, toPage)).toEqual({
      nameTreeScripts: [],
      openAction: null,
      openDestination: { kind: 'xyz', page: B, x: 50, y: 40 },
    });
  });
});
