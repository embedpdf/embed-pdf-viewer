import type { AnnotationList } from '../annotation/AnnotationList';
import type { AnnotationDTO } from '../annotation/kinds';
import type { PageState } from '../revision/PageState';

/**
 * Returns a list of human-readable difference strings between two
 * `annotations.list()` results, page by page. Empty array means parity.
 * Used by `engine-node.ts` to assert that local and cloud emit identical
 * annotations for the same fixture.
 *
 * `RevisionToken.docSessionId` is intentionally not compared — sessions
 * are disjoint. We do compare `pageObjectNumber` and `generation` (which
 * should be 0 for fresh reads on both sides). Page order is no longer part
 * of `PageState`; it lives in `PageLayout.index` (see `pages.list()`).
 * `auditHead` is likewise not compared: it is a cloud-only reconciliation
 * cursor, absent on local lists by design.
 */
export function diffAnnotationList(a: AnnotationList, b: AnnotationList): string[] {
  const errs: string[] = [];
  if (a.pages.length !== b.pages.length) {
    errs.push(`pages.length mismatch: ${a.pages.length} vs ${b.pages.length}`);
  }
  const onPage = (list: AnnotationList, state: PageState) =>
    list.annotations.filter(
      (annotation) => annotation.page.pageObjectNumber === state.page.pageObjectNumber,
    );
  const n = Math.min(a.pages.length, b.pages.length);
  for (let i = 0; i < n; i++) {
    const stateA = a.pages[i]!;
    const stateB = b.pages[i]!;
    for (const e of diffPage(stateA, onPage(a, stateA), stateB, onPage(b, stateB))) {
      errs.push(`page[${i}]: ${e}`);
    }
  }
  return errs;
}

function diffPage(
  stateA: PageState,
  a: AnnotationDTO[],
  stateB: PageState,
  b: AnnotationDTO[],
): string[] {
  const errs: string[] = [];
  if (stateA.page.pageObjectNumber !== stateB.page.pageObjectNumber) {
    errs.push(
      `page.pageObjectNumber mismatch: ${stateA.page.pageObjectNumber} vs ${stateB.page.pageObjectNumber}`,
    );
  }
  if (JSON.stringify(stateA.weakAnnotationState) !== JSON.stringify(stateB.weakAnnotationState)) {
    errs.push(
      `weakAnnotationState mismatch: ${JSON.stringify(stateA.weakAnnotationState)} vs ${JSON.stringify(
        stateB.weakAnnotationState,
      )}`,
    );
  }
  if (stateA.revision.generation !== stateB.revision.generation) {
    errs.push(
      `revision.generation mismatch: ${stateA.revision.generation} vs ${stateB.revision.generation}`,
    );
  }
  if (a.length !== b.length) {
    errs.push(`annotations.length mismatch: ${a.length} vs ${b.length}`);
  }
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) diffAnnotation(i, a[i]!, b[i]!, errs);
  return errs;
}

function diffAnnotation(i: number, a: AnnotationDTO, b: AnnotationDTO, errs: string[]): void {
  if (a.subtype !== b.subtype) {
    errs.push(`annotations[${i}].subtype mismatch: ${a.subtype} vs ${b.subtype}`);
    return;
  }
  if (a.identityQuality !== b.identityQuality) {
    errs.push(
      `annotations[${i}].identityQuality mismatch: ${a.identityQuality} vs ${b.identityQuality}`,
    );
  }
  if (a.ref.kind !== b.ref.kind) {
    errs.push(`annotations[${i}].ref.kind mismatch: ${a.ref.kind} vs ${b.ref.kind}`);
  }
  if (a.ref.kind === 'objectNumber' && b.ref.kind === 'objectNumber') {
    if (a.ref.annotObjectNumber !== b.ref.annotObjectNumber) {
      errs.push(
        `annotations[${i}].ref.annotObjectNumber mismatch: ${a.ref.annotObjectNumber} vs ${b.ref.annotObjectNumber}`,
      );
    }
  }
  if (a.nm !== b.nm) {
    errs.push(`annotations[${i}].nm mismatch: ${a.nm} vs ${b.nm}`);
  }
}
