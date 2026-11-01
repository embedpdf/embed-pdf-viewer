/**
 * The render ledger: per-page raster versions. Every function below is a
 * pure transition or projection; the controller applies the transitions with
 * `ctx.state.update`.
 */
import type { PageObjectNumber, PageRenderLayers, ResourceStatus } from '@embedpdf/core';
import type { InvalidateScope, PictureState } from './contract';

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
  /**
   * Whether each page's picture is on screen, per view: `pictures[view][page]`. A page a view
   * doesn't show is absent (`idle`). Written from the layers' reports (`pictures.ts`).
   */
  readonly pictures: Readonly<Record<string, Readonly<Record<PageObjectNumber, PictureState>>>>;
}

export const initialRenderState = (): RenderState => ({
  contentEpochs: {},
  annotationEpochs: {},
  fieldEpochs: {},
  pictures: {},
});

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

// ── whether a page's picture is on screen ──

const pictureState = (status: ResourceStatus, slow = false): PictureState =>
  Object.freeze({ status, slow });

/** Every picture state there is, one object each, so the same state is the same object. */
export const PICTURE_STATES = {
  idle: pictureState('idle'),
  loading: pictureState('loading'),
  slow: pictureState('loading', true),
  ready: pictureState('ready'),
  forbidden: pictureState('forbidden'),
  error: pictureState('error'),
} as const;

/** A page's picture state in a view: `idle` when the view doesn't show it. */
export function pictureStateOf(
  state: RenderState,
  view: string,
  pageObjectNumber: PageObjectNumber,
): PictureState {
  return state.pictures[view]?.[pageObjectNumber] ?? PICTURE_STATES.idle;
}

/** Set a page's picture state in a view; `idle` takes the page out (and the view, once empty). */
export function setPictureState(
  state: RenderState,
  view: string,
  pageObjectNumber: PageObjectNumber,
  next: PictureState,
): RenderState {
  const { [pageObjectNumber]: _previous, ...others } = state.pictures[view] ?? {};
  const pages = next.status === 'idle' ? others : { ...others, [pageObjectNumber]: next };
  const { [view]: _view, ...otherViews } = state.pictures;
  return {
    ...state,
    pictures: Object.keys(pages).length > 0 ? { ...otherViews, [view]: pages } : otherViews,
  };
}
