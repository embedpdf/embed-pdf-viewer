/**
 * The pending view: `redact` annotations projected as marks, per page and
 * memoized on the annotation plane's own reference-stable lists, plus the
 * client-side collateral estimate.
 */
import { edgesOfQuad, edgesOverlap } from '@embedpdf/core-geometry';
import { annotationKey } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationRef, PageRef, PdfRect } from '@embedpdf/engine-core';

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

  /** Marks per page, keyed by the plane's reference-stable list for that page. */
  const perPage = new Map<
    number,
    { source: readonly unknown[]; marks: readonly RedactionMark[] }
  >();
  const marksOn = (page: PageRef): readonly RedactionMark[] => {
    const records = annotation.list({ page, subtype: 'redact' });
    const hit = perPage.get(page.pageObjectNumber);
    if (hit && hit.source === records) return hit.marks;
    const marks = records.flatMap((record): RedactionMark[] => {
      const raw = annotation.getRaw(record.ref);
      if (!raw || raw.subtype !== 'redact') return [];
      return [
        {
          ref: record.ref,
          page,
          pageIndex: pageIndexOf(page.pageObjectNumber),
          kind: raw.quadPoints.length > 0 ? 'text' : 'area',
          bounds: record.bounds,
          overlayText: raw.overlayText,
        },
      ];
    });
    perPage.set(page.pageObjectNumber, { source: records, marks: marks.length ? marks : EMPTY });
    return marks.length ? marks : EMPTY;
  };

  /** The whole document's marks, reference-stable while no page's list changed. */
  let allSources: readonly (readonly RedactionMark[])[] = [];
  let all: readonly RedactionMark[] = EMPTY;
  const listPending = (filter?: RedactionMarkFilter): readonly RedactionMark[] => {
    if (filter?.page) return marksOn(filter.page);
    const sources = pages().map(marksOn);
    if (sources.length === allSources.length && sources.every((s, i) => s === allSources[i])) {
      return all;
    }
    allSources = sources;
    all = sources.some((s) => s.length) ? sources.flat() : EMPTY;
    return all;
  };
  const getPending = (ref: AnnotationRef): RedactionMark | null => {
    const key = annotationKey(ref);
    return listPending().find((mark) => annotationKey(mark.ref) === key) ?? null;
  };

  const estimateCollateral = (refs?: readonly AnnotationRef[]): RedactionCollateral => {
    const wanted = refs ? new Set(refs.map(annotationKey)) : null;
    const hits: AnnotationRef[] = [];
    for (const page of pages()) {
      const all = annotation.listRaw({ page });
      const marks = all.filter(
        (a): a is RedactDTO =>
          a.subtype === 'redact' && (!wanted || wanted.has(annotationKey(a.ref))),
      );
      if (marks.length === 0) continue;
      const regions = marks.flatMap(regionsOf);
      for (const other of all) {
        if (other.subtype === 'redact') continue;
        if (regions.some((r) => edgesOverlap(r, other.rect))) hits.push(other.ref);
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
