import type { PageRef } from '@embedpdf/core';
import type { CreationDraftAnchor, Rect, Point } from '@embedpdf/core-annotation';

/** The annotation selection's menu anchor on its primary page, in page space. */
export type AnnotationSelectionAnchor = { page: PageRef; bounds: Rect; knob?: Point };

export function sameAnchor(
  left: AnnotationSelectionAnchor | null,
  right: AnnotationSelectionAnchor | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.page.pageObjectNumber === right.page.pageObjectNumber &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height &&
    left.knob?.x === right.knob?.x &&
    left.knob?.y === right.knob?.y
  );
}

export function sameCreationDraftAnchor(
  left: CreationDraftAnchor | null,
  right: CreationDraftAnchor | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.kind === right.kind &&
    left.subtype === right.subtype &&
    left.page.pageObjectNumber === right.page.pageObjectNumber &&
    left.pointCount === right.pointCount &&
    left.minPoints === right.minPoints &&
    left.canFinish === right.canFinish &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
  );
}
