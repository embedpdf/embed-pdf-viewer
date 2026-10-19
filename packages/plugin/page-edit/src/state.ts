/**
 * The pages page's State table as code: what `usePageEditState()` returns,
 * and the same fields in every other framework.
 */
import { defineState } from '@embedpdf/core';

import { PageEditToken } from './contract';

export const pageEditState = defineState(PageEditToken, {
  read: (pageEdit) => ({
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
