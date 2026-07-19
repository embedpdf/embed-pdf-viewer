import type {
  AnnotationDTO,
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
  PageState,
} from '@embedpdf/engine-core';
import type { Engine } from '@embedpdf/engine-core/runtime';

/**
 * What we collect from a single engine for the annotations fixture: the
 * whole-document raw read (no pagePtr) plus the per-page full read for
 * every page in the document. Both shapes are what the v3 conformance
 * harness exercises, so by running the same probe against local + cloud
 * we get a parity check that mirrors what tests already enforce.
 */
export interface AnnotationsDemoResult {
  label: string;
  docId: string;
  /** Total elapsed ms, including open + listRawAll + per-page list + close. */
  elapsedMs: number;
  rawAll: AnnotationListSnapshotAllPages;
  fullByPage: Record<number, AnnotationListPageSnapshot>;
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
    const rawAll = await doc.annotations.listRawAll();

    const fullByPage: Record<number, AnnotationListPageSnapshot> = {};
    for (const page of rawAll.pages) {
      const pon = page.pageState.pageObjectNumber;
      fullByPage[pon] = await doc.page(pon).annotations.list();
    }

    return {
      label,
      docId: doc.id,
      elapsedMs: Date.now() - started,
      rawAll,
      fullByPage,
    };
  } finally {
    await doc.close();
  }
}

/** A compact human summary of a snapshot, for console output. */
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

export function summarizeRawAll(snap: AnnotationListSnapshotAllPages): AnnotationsSummary {
  return {
    pages: snap.pages.map((p, pageIndex) => ({
      pageObjectNumber: p.pageState.pageObjectNumber,
      pageIndex,
      hasAnyWeakAnnotations: knownWeakFlag(p.pageState),
      annotations: p.annotations.map((a) => ({
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
