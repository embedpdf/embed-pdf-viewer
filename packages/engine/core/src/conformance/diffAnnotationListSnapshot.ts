import type {
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
} from '../annotation/AnnotationListSnapshot';
import type { AnnotationDTO } from '../annotation/kinds';

/**
 * Returns a list of human-readable difference strings between two
 * snapshots. Empty array means parity. Used by `engine-node.ts` to assert
 * that local and cloud emit identical annotations for the same fixture.
 *
 * `RevisionToken.docSessionId` is intentionally NOT compared — sessions
 * are disjoint. We do compare `pageObjectNumber` and `generation` (which
 * should be 0 for fresh reads on both sides). Page order is no longer part
 * of `PageState`; it lives in `PageLayout.index` (see `pages.list()`).
 */
export function diffAnnotationListSnapshot(
  a: AnnotationListPageSnapshot,
  b: AnnotationListPageSnapshot,
): string[] {
  const errs: string[] = [];

  if (a.pageState.pageObjectNumber !== b.pageState.pageObjectNumber) {
    errs.push(
      `pageState.pageObjectNumber mismatch: ${a.pageState.pageObjectNumber} vs ${b.pageState.pageObjectNumber}`,
    );
  }
  if (
    JSON.stringify(a.pageState.weakAnnotationState) !==
    JSON.stringify(b.pageState.weakAnnotationState)
  ) {
    errs.push(
      `pageState.weakAnnotationState mismatch: ${JSON.stringify(
        a.pageState.weakAnnotationState,
      )} vs ${JSON.stringify(b.pageState.weakAnnotationState)}`,
    );
  }
  if (a.pageState.revision.generation !== b.pageState.revision.generation) {
    errs.push(
      `pageState.revision.generation mismatch: ${a.pageState.revision.generation} vs ${b.pageState.revision.generation}`,
    );
  }
  if (a.annotations.length !== b.annotations.length) {
    errs.push(`annotations.length mismatch: ${a.annotations.length} vs ${b.annotations.length}`);
  }

  const n = Math.min(a.annotations.length, b.annotations.length);
  for (let i = 0; i < n; i++) {
    const aa = a.annotations[i]!;
    const bb = b.annotations[i]!;
    diffAnnotation(i, aa, bb, errs);
  }

  return errs;
}

export function diffAnnotationListSnapshotAll(
  a: AnnotationListSnapshotAllPages,
  b: AnnotationListSnapshotAllPages,
): string[] {
  const errs: string[] = [];
  if (a.pages.length !== b.pages.length) {
    errs.push(`pages.length mismatch: ${a.pages.length} vs ${b.pages.length}`);
  }
  const n = Math.min(a.pages.length, b.pages.length);
  for (let i = 0; i < n; i++) {
    const pageErrs = diffAnnotationListSnapshot(a.pages[i]!, b.pages[i]!);
    for (const e of pageErrs) {
      errs.push(`page[${i}]: ${e}`);
    }
  }
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
