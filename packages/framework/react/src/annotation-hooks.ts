import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';

import { shallowArray, useSelector } from './runtime';

/** The selected annotations as page-space records — for selection-aware toolbars/sidebars. */
export function useAnnotationSelected() {
  return useSelector(AnnotationToken, (c) => c.listSelected(), shallowArray);
}
