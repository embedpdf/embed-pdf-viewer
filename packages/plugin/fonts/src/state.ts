/**
 * The fonts' State table as code: what `useFontsState()` returns, and the
 * same fields in every other framework. Reading the state loads the list
 * (`ensure`): the first reader of a document starts the read.
 */
import { defineState } from '@embedpdf/core';

import { FontsToken } from './contract';

export const fontsState = defineState(FontsToken, {
  read: (fonts) => ({
    fonts: fonts.getFontList(),
    status: fonts.getStatus(),
  }),
  empty: {
    fonts: null,
    status: 'idle',
  },
  ensure: (fonts) => fonts.ensureLoaded(),
});
