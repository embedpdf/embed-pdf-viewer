import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import { shallowArray, useSelector } from './runtime';

/** The selected annotations as engine DTOs — for selection-aware toolbars/sidebars. */
export function useAnnotationSelected() {
  return useSelector(AnnotationToken, (c) => c.getSelected(), shallowArray);
}
