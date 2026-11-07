/**
 * The render ledger: per-page raster versions, and the snapshot tool's box.
 * Every function below is a pure transition or projection; the controller
 * applies the transitions with `ctx.state.update`.
 */
import type { PageObjectNumber, PageRef, PageRenderLayers } from '@embedpdf/core';
import type { Rotation, Point } from '@embedpdf/core-geometry';
import type { InvalidateScope } from './contract';

/**
 * Per-page versions of what a page picture can draw: the page content, its
 * annotations and its form fields. Fed by the document event stream and by
 * the `invalidate` verb: a confirmed pixel-changing fact, own or remote,
 * bumps the touched pages, and anything holding a rendered bitmap refetches.
 * A picture's version is the sum of the parts it draws, and is part of every
 * raster and tile key.
 */
export interface RenderState {
  /** Content versions, bumped by content facts (redaction, flatten). */
  readonly contentEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Annotation versions, bumped by annotation facts (widgets excepted). */
  readonly annotationEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** Form field versions, bumped by form facts: a fill, a widget's move or look, a signing. */
  readonly fieldEpochs: Readonly<Record<PageObjectNumber, number>>;
  /** The snapshot tool's box, while it is dragged or held. */
  readonly snapshot: SnapshotBox | null;
}

/**
 * The snapshot tool's box: two corners on the page the press was on, in page
 * space. Dragged until the release; held from then on, as the snapshot.
 */
export interface SnapshotBox {
  readonly page: PageRef;
  /** Where the press was. */
  readonly from: Point;
  /** Where the pointer is, kept on the page. */
  readonly to: Point;
  /** View px per page unit at the press, which tells a box from a click. */
  readonly scale: number;
  /** The page's turn on screen at the press: the picture turns with it. */
  readonly rotation: Rotation;
  /** Released: the box is the snapshot. */
  readonly held: boolean;
}

export const initialRenderState = (): RenderState => ({
  contentEpochs: {},
  annotationEpochs: {},
  fieldEpochs: {},
  snapshot: null,
});

export function setSnapshotBox(state: RenderState, snapshot: SnapshotBox | null): RenderState {
  return state.snapshot === snapshot ? state : { ...state, snapshot };
}

const bump = (
  epochs: Readonly<Record<PageObjectNumber, number>>,
  pageObjectNumbers: readonly PageObjectNumber[],
): Record<PageObjectNumber, number> => {
  const next: Record<PageObjectNumber, number> = { ...epochs };
  for (const pageObjectNumber of pageObjectNumbers) {
    next[pageObjectNumber] = (next[pageObjectNumber] ?? 0) + 1;
  }
  return next;
};

/**
 * Bump the pages' versions in the ledger the scope names. A content fact
 * bumps only the content ledger; every picture counts content (see
 * {@link renderEpochOf}), which is how content invalidation reaches them all.
 */
export function invalidatePages(
  state: RenderState,
  pageObjectNumbers: readonly PageObjectNumber[],
  scope: InvalidateScope,
): RenderState {
  if (pageObjectNumbers.length === 0) return state;
  switch (scope) {
    case 'content':
      return { ...state, contentEpochs: bump(state.contentEpochs, pageObjectNumbers) };
    case 'annotations':
      return { ...state, annotationEpochs: bump(state.annotationEpochs, pageObjectNumbers) };
    case 'fields':
      return { ...state, fieldEpochs: bump(state.fieldEpochs, pageObjectNumbers) };
  }
}

/** The version of one picture of a page: its content, plus the annotations and form fields it draws. */
export function renderEpochOf(
  state: RenderState,
  pageObjectNumber: PageObjectNumber,
  layers: PageRenderLayers,
): number {
  return (
    (state.contentEpochs[pageObjectNumber] ?? 0) +
    (layers.includeAnnotations ? (state.annotationEpochs[pageObjectNumber] ?? 0) : 0) +
    (layers.includeFormFields ? (state.fieldEpochs[pageObjectNumber] ?? 0) : 0)
  );
}

/** What a picture draws, as one key part: `a1f0` draws annotations and no form fields. */
export const layersKeyOf = (layers: PageRenderLayers): string =>
  `a${layers.includeAnnotations ? 1 : 0}f${layers.includeFormFields ? 1 : 0}`;
