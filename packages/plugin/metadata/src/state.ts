/**
 * The metadata page's State table as code: what `useMetadataState()` returns,
 * and the same fields in every other framework. `status` is the standard
 * fields' load state; `custom.getStatus()` has the custom keys' own.
 */
import { defineState } from '@embedpdf/core';

import { MetadataToken } from './contract';

export const metadataState = defineState(MetadataToken, {
  read: (metadata) => ({
    metadata: metadata.getSnapshot(),
    custom: metadata.custom.getSnapshot(),
    status: metadata.getStatus(),
  }),
  empty: {
    metadata: null,
    custom: null,
    status: 'idle',
  },
});
