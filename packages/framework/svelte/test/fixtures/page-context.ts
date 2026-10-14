/** A page context for a layer under test: a 600 × 800 page at 100%, its box at the client origin. */
import { pageTransform } from '@embedpdf/core-geometry';
import { makePageContext, toPageRef } from '../../src/runtime';

const NO_FRAME = { top: 0, right: 0, bottom: 0, left: 0 };

export const pageContext = (objectNumber: number, index: number) =>
  makePageContext(
    'doc',
    'test-view',
    toPageRef(objectNumber),
    index,
    NO_FRAME,
    pageTransform({
      pageSize: { width: 600, height: 800 },
      rotation: 0,
      scale: 1,
      baseScale: 1,
      dpr: 1,
    }),
    () => new DOMRect(0, 0, 600, 800),
  );
