import type { CreationDraftAnchor, RotationAnchor } from '@embedpdf/core-annotation';
import type { AnnotationSelectionAnchor } from '@embedpdf/plugin-annotation/contract';

/** The same anchor: page, box and rotation handle. */
export function sameAnchor(
  left: AnnotationSelectionAnchor | null,
  right: AnnotationSelectionAnchor | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.page.objectNumber === right.page.objectNumber &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height &&
    left.rotationHandle?.x === right.rotationHandle?.x &&
    left.rotationHandle?.y === right.rotationHandle?.y
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
    left.page.objectNumber === right.page.objectNumber &&
    left.pointCount === right.pointCount &&
    left.minPoints === right.minPoints &&
    left.canFinish === right.canFinish &&
    left.bounds.x === right.bounds.x &&
    left.bounds.y === right.bounds.y &&
    left.bounds.width === right.bounds.width &&
    left.bounds.height === right.bounds.height
  );
}

export function sameRotationAnchor(
  left: RotationAnchor | null,
  right: RotationAnchor | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return (
    left.page.objectNumber === right.page.objectNumber &&
    left.at.x === right.at.x &&
    left.at.y === right.at.y &&
    left.angle === right.angle
  );
}
