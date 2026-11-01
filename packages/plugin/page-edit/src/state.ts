/**
 * The pages page's State table as code: what `usePageEditState()` returns,
 * and the same fields in every other framework.
 */
import { defineState, type PageRef } from '@embedpdf/core';

import { PageEditToken } from './contract';

/** The selected pages, and what this session may do with pages. */
export interface PageEditState {
  /** The selected pages, in the order they were selected. */
  readonly selected: readonly PageRef[];
  /** Whether rotating, reordering, deleting and inserting pages is allowed (`doc.pages.assemble`). */
  readonly canEdit: boolean;
  /** Whether copying pages out is allowed (`doc.download`). */
  readonly canExtract: boolean;
}

export const pageEditState = defineState(PageEditToken, {
  read: (pageEdit): PageEditState => ({
    selected: pageEdit.getSelected(),
    canEdit: pageEdit.canEdit(),
    canExtract: pageEdit.canExtract(),
  }),
  empty: {
    selected: [],
    canEdit: false,
    canExtract: false,
  },
});
