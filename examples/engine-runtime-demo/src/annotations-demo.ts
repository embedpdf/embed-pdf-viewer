import type { AnnotationDTO, AnnotationList, PageState } from '@embedpdf/engine-core';
import type { Engine } from '@embedpdf/engine-core/runtime';

/**
 * What we collect from a single engine for the annotations fixture: the
 * whole-document list plus each page's own list, for every page in the
 * document. Both shapes are what the v3 conformance
 * harness exercises, so by running the same probe against local + cloud
 * we get a parity check that mirrors what tests already enforce.
 */
export interface AnnotationsDemoResult {
  label: string;
  docId: string;
  /** Total elapsed ms, including open + the document list + each page's list + close. */
  elapsedMs: number;
  all: AnnotationList;
  byPage: Record<number, AnnotationList>;
}

export async function runAnnotationsDemo(
  label: string,
  engine: Engine,
  pdfBytes: Uint8Array,
  docId = `annot-demo-${label}`,
): Promise<AnnotationsDemoResult> {
  const started = Date.now();
  const doc = await engine.open({ kind: 'bytes', id: docId, bytes: pdfBytes });
  try {
    const all = await doc.annotations.list();

    const byPage: Record<number, AnnotationList> = {};
    for (const state of all.pages) {
      byPage[state.page.pageObjectNumber] = await doc.page(state.page).annotations.list();
    }

    return { label, docId: doc.id, elapsedMs: Date.now() - started, all, byPage };
  } finally {
    await doc.close();
  }
}

/** A compact human summary of a list, for console output. */
export interface AnnotationsSummary {
  pages: Array<{
    pageObjectNumber: number;
    pageIndex: number;
    hasAnyWeakAnnotations: boolean | null;
    annotations: Array<{
      index: number;
      subtype: string;
      identityQuality: string;
      ref: string;
      nm: string | null;
    }>;
  }>;
}

export function summarizeList(list: AnnotationList): AnnotationsSummary {
  return {
    pages: list.pages.map((state, pageIndex) => ({
      pageObjectNumber: state.page.pageObjectNumber,
      pageIndex,
      hasAnyWeakAnnotations: knownWeakFlag(state),
      annotations: list.annotations
        .filter((a) => a.page.pageObjectNumber === state.page.pageObjectNumber)
        .map((a) => ({
          index: a.index,
          subtype: a.subtype,
          identityQuality: a.identityQuality,
          ref: describeRef(a),
          nm: a.nm,
        })),
    })),
  };
}

function knownWeakFlag(pageState: PageState): boolean | null {
  return pageState.weakAnnotationState.kind === 'known'
    ? pageState.weakAnnotationState.hasAnyWeakAnnotations
    : null;
}

function describeRef(a: AnnotationDTO): string {
  switch (a.ref.kind) {
    case 'objectNumber':
      return `objectNumber=${a.ref.annotObjectNumber}`;
    case 'nm':
      return `nm=${a.ref.nm}`;
    case 'index':
      return `index=${a.ref.index}@gen=${a.ref.revision.generation}`;
  }
}
