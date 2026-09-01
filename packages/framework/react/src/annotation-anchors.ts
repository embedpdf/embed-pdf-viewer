import type { CreationDraftAnchor, Rect, Vec } from '@embedpdf/core-annotation';

/** The selection's menu anchor on its primary page, in content space. */
export type SelectionAnchor = { pon: number; bounds: Rect; knob?: Vec };

export function sameAnchor(a: SelectionAnchor | null, b: SelectionAnchor | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return (
    a.pon === b.pon &&
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
    a.pon === b.pon &&
    a.pointCount === b.pointCount &&
    a.minPoints === b.minPoints &&
    a.canFinish === b.canFinish &&
    a.bounds.x === b.bounds.x &&
    a.bounds.y === b.bounds.y &&
    a.bounds.width === b.bounds.width &&
    a.bounds.height === b.bounds.height
  );
}
