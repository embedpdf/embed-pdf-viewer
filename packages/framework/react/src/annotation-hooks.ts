import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import { sameRotationAnchor } from './annotation-anchors';
import { shallowArray, useSelector } from './runtime';

/** The selected annotations as page-space records — for selection-aware toolbars/sidebars. */
export function useAnnotationSelected() {
  return useSelector(AnnotationToken, (annotation) => annotation.listSelected(), shallowArray);
}

/**
 * The rotation in progress: its page, the pointer there and the selection's
 * angle (degrees clockwise), or `null` when nothing is being turned. What
 * `<AnnotationRotationBadge>` shows; use it to build your own.
 */
export function useAnnotationRotation() {
  return useSelector(
    AnnotationToken,
    (annotation) => annotation.getRotationAnchor(),
    sameRotationAnchor,
  );
}
