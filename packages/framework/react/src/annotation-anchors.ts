import type { PageRef } from '@embedpdf/core';
import type { CreationDraftAnchor, Rect, Vec } from '@embedpdf/core-annotation';

/** The annotation selection's menu anchor on its primary page, in page space. */
export type AnnotationSelectionAnchor = { page: PageRef; bounds: Rect; knob?: Vec };

export function sameAnchor(
  a: AnnotationSelectionAnchor | null,
  b: AnnotationSelectionAnchor | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.page.pageObjectNumber === b.page.pageObjectNumber &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height &&
    a.knob?.x === b.knob?.x &&
    a.knob?.y === b.knob?.y
  );
}

export function sameCreationDraftAnchor(
  a: CreationDraftAnchor | null,
  b: CreationDraftAnchor | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.kind === b.kind &&
    a.subtype === b.subtype &&
    a.page.pageObjectNumber === b.page.pageObjectNumber &&
    a.pointCount === b.pointCount &&
    a.minPoints === b.minPoints &&
    a.canFinish === b.canFinish &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  );
}
