/**
 * The pending view: `redact` annotations projected as marks, per page and
 * memoized on the annotation plane's own reference-stable lists, plus the
 * client-side collateral estimate.
 */
import { edgesOfQuad, edgesOverlap } from '@embedpdf/core-geometry';
import { annotationKey, memo, memoByKey, toPageRef } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationRef, PdfRect } from '@embedpdf/engine-core';

import type {
  RedactionCapability,
  RedactionCollateral,
  RedactionMark,
  RedactionMarkFilter,
} from '../contract';
import type { RedactionServices } from '../services';

type RedactDTO = Extract<AnnotationDTO, { subtype: 'redact' }>;

/** The PDF-space regions a redact mark targets: its quads' boxes, else `/Rect`. */
const regionsOf = (dto: RedactDTO): readonly PdfRect[] =>
  dto.quadPoints.length === 0 ? [dto.rect] : dto.quadPoints.map(edgesOfQuad);

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
        const raw = annotation.getRaw(record.ref);
        if (!raw || raw.subtype !== 'redact') return [];
        return [
          {
            ref: record.ref,
            page,
            pageIndex,
            kind: raw.quadPoints.length > 0 ? 'text' : 'area',
            bounds: record.bounds,
            overlayText: raw.overlayText,
          },
        ];
      });
      return marks.length ? marks : EMPTY;
    },
  );

  /** The whole document's marks, the same array while no page's marks changed. */
  const allMarks = memo(
    () => pages().map((page) => marksOn(page.pageObjectNumber)),
    (...perPage: (readonly RedactionMark[])[]): readonly RedactionMark[] =>
      perPage.some((marks) => marks.length) ? perPage.flat() : EMPTY,
  );

  const listPending = (filter?: RedactionMarkFilter): readonly RedactionMark[] =>
    filter?.page ? marksOn(filter.page.pageObjectNumber) : allMarks();

  const getPending = (ref: AnnotationRef): RedactionMark | null => {
    const key = annotationKey(ref);
    return listPending().find((mark) => annotationKey(mark.ref) === key) ?? null;
  };

  const estimateCollateral = (refs?: readonly AnnotationRef[]): RedactionCollateral => {
    const wanted = refs ? new Set(refs.map(annotationKey)) : null;
    const hits: AnnotationRef[] = [];
    for (const page of pages()) {
      const onPage = annotation.listRaw({ page });
      const marks = onPage.filter(
        (dto): dto is RedactDTO =>
          dto.subtype === 'redact' && (!wanted || wanted.has(annotationKey(dto.ref))),
      );
      if (marks.length === 0) continue;
      const regions = marks.flatMap(regionsOf);
      for (const other of onPage) {
        if (other.subtype === 'redact') continue;
        if (regions.some((region) => edgesOverlap(region, other.rect))) hits.push(other.ref);
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
