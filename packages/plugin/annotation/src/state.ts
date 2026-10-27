/**
 * The selecting page's State table as code: what `useAnnotationState()`
 * returns, and the same fields in every other framework. The annotations
 * themselves are not here: `useAnnotationList()` reads them, so a component
 * that shows the selection doesn't re-render for every change on the page.
 */
import { defineState, type ResourceStatus } from '@embedpdf/core';
import type { Annotation } from '@embedpdf/engine-core/runtime';

import { AnnotationToken } from './token';

/** Whether the annotations are read, and the ones selected, under the pointer and being typed in. */
export interface AnnotationState {
  /** `loading` until the document's annotations are in, then `ready`; `forbidden` or `error` when they can't load. */
  readonly status: ResourceStatus;
  /** The selected annotations, as the user sees them. */
  readonly selected: readonly Annotation[];
  /** The annotation under the pointer, or `null`. */
  readonly hovered: Annotation | null;
  /** The text box being typed in, or `null`. */
  readonly editing: Annotation | null;
}

export const annotationState = defineState(AnnotationToken, {
  read: (annotation): AnnotationState => ({
    status: annotation.getStatus(),
    selected: annotation.selection.list(),
    hovered: annotation.getHovered(),
    editing: annotation.text.getEditing(),
  }),
  empty: { status: 'loading', selected: [], hovered: null, editing: null },
});
