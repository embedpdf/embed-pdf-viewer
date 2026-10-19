/**
 * The pending view: `redact` annotations projected as marks, per page and
 * memoized on the annotation plane's own reference-stable lists, plus the
 * client-side collateral estimate.
 */
import { rectsOverlap } from '@embedpdf/core-geometry';
import { annotationKey, memo, memoByKey, toPageRef } from '@embedpdf/core';
import {
  pageQuadBounds,
  type Annotation,
  type AnnotationRef,
  type PageBox,
  type PageRef,
} from '@embedpdf/engine-core';

import type {
  RedactionCapability,
  RedactionCollateral,
  RedactionMark,
  RedactionMarkFilter,
} from '../contract';
import type { RedactionContext, RedactionServices } from '../services';

type RedactDTO = Extract<Annotation, { subtype: 'redact' }>;

/** The regions a redact mark targets: its quads' boxes, else its `rect`. */
const regionsOf = (dto: RedactDTO): readonly PageBox[] =>
  dto.quadPoints.length === 0 ? [dto.rect] : dto.quadPoints.map(pageQuadBounds);

const EMPTY: readonly RedactionMark[] = [];

/** A `redact` annotation as a mark; `pageIndex` is its page's display index. */
export const markOf = (record: RedactDTO, pageIndex: number): RedactionMark => ({
  ref: record.ref,
  page: record.ref.page,
  pageIndex,
  kind: record.quadPoints.length > 0 ? 'text' : 'area',
  bounds: record.rect,
  overlayText: record.overlayText ?? null,
  repeat: record.repeat ?? false,
});

export function createPendingReads(
  ctx: Pick<RedactionContext, 'getPage'>,
  { store, siblings }: Pick<RedactionServices, 'store' | 'siblings'>,
) {
  const { pages, pageIndexOf } = store;
  const { annotation } = siblings;

  /** One page's marks, the same array while the plane's list and the page's position hold. */
  const marksOn = memoByKey(
    (pageObjectNumber: number) => {
      const page = toPageRef(pageObjectNumber);
      // The page's list is the same array while it holds; the marks are picked from it.
      return [annotation.list({ pages: [page] }), pageIndexOf(page)] as const;
    },
    (_pageObjectNumber, records, pageIndex): readonly RedactionMark[] => {
      const marks = records.flatMap((record): RedactionMark[] =>
        record.subtype === 'redact' ? [markOf(record, pageIndex)] : [],
      );
      return marks.length ? marks : EMPTY;
    },
  );

  /** The whole document's marks, the same array while no page's marks changed. */
  const allMarks = memo(
    () => pages().map((page) => marksOn(page.objectNumber)),
    (...perPage: (readonly RedactionMark[])[]): readonly RedactionMark[] =>
      perPage.some((marks) => marks.length) ? perPage.flat() : EMPTY,
  );

  /** One page's marks (a ref or an index; none for a page that isn't there), or every mark. */
  const listPending = (filter?: RedactionMarkFilter): readonly RedactionMark[] => {
    if (filter?.page === undefined) return allMarks();
    const layout = ctx.getPage(filter.page);
    return layout ? marksOn(layout.ref.objectNumber) : EMPTY;
  };

  /** A record the annotation plugin made or changed, as the mark it is. */
  const markFor = (record: Annotation): RedactionMark | null =>
    record.subtype === 'redact' ? markOf(record, pageIndexOf(record.ref.page)) : null;

  const getPending = (ref: AnnotationRef): RedactionMark | null => {
    const key = annotationKey(ref);
    return listPending().find((mark) => annotationKey(mark.ref) === key) ?? null;
  };

  const estimateCollateral = (refs?: readonly AnnotationRef[]): RedactionCollateral => {
    const wanted = refs ? new Set(refs.map(annotationKey)) : null;
    const hits: AnnotationRef[] = [];
    for (const page of pages()) {
      const onPage = annotation.list({ pages: [page] });
      const marks = onPage.filter(
        (dto): dto is RedactDTO =>
          dto.subtype === 'redact' && (!wanted || wanted.has(annotationKey(dto.ref))),
      );
      if (marks.length === 0) continue;
      const regions = marks.flatMap(regionsOf);
      for (const other of onPage) {
        if (other.subtype === 'redact') continue;
        if (regions.some((region) => rectsOverlap(region, other.rect))) hits.push(other.ref);
      }
    }
    return { count: hits.length, refs: hits };
  };

  return {
    listPending,
    markFor,
    api: {
      listPending,
      getPending,
      getPendingCount: (page?: PageRef | number) =>
        listPending(page === undefined ? undefined : { page }).length,
      estimateCollateral,
    } satisfies Partial<RedactionCapability>,
  };
}
export type RedactionPendingReads = ReturnType<typeof createPendingReads>;
