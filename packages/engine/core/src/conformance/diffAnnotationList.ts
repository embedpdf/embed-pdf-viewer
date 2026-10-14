import type { AnnotationList } from '../annotation/AnnotationList';
import { annotationKey } from '../identity/annotationKey';
import type { PageRef } from '../identity/PageRef';
import type { Annotation } from '../annotation/kinds';

/**
 * Returns a list of human-readable difference strings between two
 * `annotations.list()` results, page by page. Empty array means parity.
 * Used by `engine-node.ts` to assert that local and cloud emit identical
 * annotations for the same fixture: the same pages, and on each the same
 * annotations under the same names. `auditHead` is not compared: it is a
 * cloud-only reconciliation cursor, absent on local lists by design.
 */
export function diffAnnotationList(a: AnnotationList, b: AnnotationList): string[] {
  const errs: string[] = [];
  if (a.pages.length !== b.pages.length) {
    errs.push(`pages.length mismatch: ${a.pages.length} vs ${b.pages.length}`);
  }
  const onPage = (list: AnnotationList, page: PageRef) =>
    list.annotations.filter((annotation) => annotation.page.objectNumber === page.objectNumber);
  const n = Math.min(a.pages.length, b.pages.length);
  for (let i = 0; i < n; i++) {
    const pageA = a.pages[i]!;
    const pageB = b.pages[i]!;
    for (const e of diffPage(pageA, onPage(a, pageA), pageB, onPage(b, pageB))) {
      errs.push(`page[${i}]: ${e}`);
    }
  }
  return errs;
}

function diffPage(pageA: PageRef, a: Annotation[], pageB: PageRef, b: Annotation[]): string[] {
  const errs: string[] = [];
  if (pageA.objectNumber !== pageB.objectNumber) {
    errs.push(`page.objectNumber mismatch: ${pageA.objectNumber} vs ${pageB.objectNumber}`);
  }
  if (a.length !== b.length) {
    errs.push(`annotations.length mismatch: ${a.length} vs ${b.length}`);
  }
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) diffAnnotation(i, a[i]!, b[i]!, errs);
  return errs;
}

function diffAnnotation(i: number, a: Annotation, b: Annotation, errs: string[]): void {
  if (a.subtype !== b.subtype) {
    errs.push(`annotations[${i}].subtype mismatch: ${a.subtype} vs ${b.subtype}`);
    return;
  }
  if (annotationKey(a.ref) !== annotationKey(b.ref)) {
    errs.push(`annotations[${i}].ref mismatch: ${annotationKey(a.ref)} vs ${annotationKey(b.ref)}`);
  }
  if (a.nm !== b.nm) {
    errs.push(`annotations[${i}].nm mismatch: ${a.nm} vs ${b.nm}`);
  }
}
