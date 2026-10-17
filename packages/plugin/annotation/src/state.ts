/**
 * The selecting page's State table as code: what `useAnnotationState()`
 * returns, and the same fields in every other framework. The annotations
 * themselves are not here: `useAnnotationList()` reads them, so a component
 * that shows the selection doesn't re-render for every change on the page.
 */
import { defineState } from '@embedpdf/core';

import { AnnotationToken } from './token';

export const annotationState = defineState(AnnotationToken, {
  read: (annotation) => ({
    status: annotation.getStatus(),
    selected: annotation.selection.list(),
    hovered: annotation.getHovered(),
    editing: annotation.text.getEditing(),
  }),
  empty: { status: 'loading', selected: [], hovered: null, editing: null },
});
