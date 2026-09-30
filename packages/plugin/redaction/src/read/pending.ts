/**
 * The pending view: `redact` annotations projected as marks, per page and
 * memoized on the annotation plane's own reference-stable lists, plus the
 * client-side collateral estimate.
 */
import { rectsOverlap } from '@embedpdf/core-geometry';
import { annotationKey, memo, memoByKey, toPageRef } from '@embedpdf/core';
import {
  pageQuadBounds,
  type AnnotationDTO,
  type AnnotationRef,
  type PageBox,
} from '@embedpdf/engine-core';

import type {
  RedactionCapability,
  RedactionCollateral,
  RedactionMark,
  RedactionMarkFilter,
} from '../contract';
import type { RedactionServices } from '../services';

type RedactDTO = Extract<AnnotationDTO, { subtype: 'redact' }>;

/** The regions a redact mark targets: its quads' boxes, else its `rect`. */
const regionsOf = (dto: RedactDTO): readonly PageBox[] =>
  dto.quadPoints.length === 0 ? [dto.rect] : dto.quadPoints.map(pageQuadBounds);

const EMPTY: readonly RedactionMark[] = [];

export function createPendingReads({
  store,
  siblings,
}: Pick<RedactionServices, 'store' | 'siblings'>) {
  const { pages, pageIndexOf } = store;
  const { annotation } = siblings;

  /** One page's marks, the same array while the plane's list and the page's position hold. */
  const marksOn = memoByKey(
    (pageObjectNumber: number) => {
      const page = toPageRef(pageObjectNumber);
      return [annotation.list({ page, subtype: 'redact' }), pageIndexOf(page)] as const;
    },
    (pageObjectNumber, records, pageIndex): readonly RedactionMark[] => {
      const page = toPageRef(pageObjectNumber);
      const marks = records.flatMap((record): RedactionMark[] => {
        if (record.subtype !== 'redact') return [];
        return [
          {
            ref: record.ref,
            page,
            pageIndex,
            kind: record.quadPoints.length > 0 ? 'text' : 'area',
            bounds: record.rect,
            overlayText: record.overlayText,
          },
        ];
      });
      return marks.length ? marks : EMPTY;
    },
  );

  /** The whole document's marks, the same array while no page's marks changed. */
  const allMarks = memo(
    () => pages().map((page) => marksOn(page.objectNumber)),
    (...perPage: (readonly RedactionMark[])[]): readonly RedactionMark[] =>
      perPage.some((marks) => marks.length) ? perPage.flat() : EMPTY,
  );

  const listPending = (filter?: RedactionMarkFilter): readonly RedactionMark[] =>
    filter?.page ? marksOn(filter.page.objectNumber) : allMarks();

  const getPending = (ref: AnnotationRef): RedactionMark | null => {
    const key = annotationKey(ref);
    return listPending().find((mark) => annotationKey(mark.ref) === key) ?? null;
  };

  const estimateCollateral = (refs?: readonly AnnotationRef[]): RedactionCollateral => {
    const wanted = refs ? new Set(refs.map(annotationKey)) : null;
    const hits: AnnotationRef[] = [];
    for (const page of pages()) {
      const onPage = annotation.list({ page });
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
    api: {
      listPending,
      getPending,
      getPendingCount: (page) => listPending(page ? { page } : undefined).length,
      estimateCollateral,
    } satisfies Partial<RedactionCapability>,
  };
}
export type RedactionPendingReads = ReturnType<typeof createPendingReads>;
