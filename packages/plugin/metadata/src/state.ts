/**
 * The metadata page's State table as code: what `useMetadataState()` returns,
 * and the same fields in every other framework. `status` is the standard
 * fields' load state; `custom.getStatus()` has the custom keys' own. Reading
 * the state loads it (`ensure`): the first reader of a document starts the read.
 */
import {
  defineState,
  type CustomMetadata,
  type DocumentMetadata,
  type ResourceStatus,
} from '@embedpdf/core';

import { MetadataToken } from './contract';

/** The document's metadata, its custom keys, and whether the metadata is read. */
export interface MetadataState {
  /** The standard fields; `null` until the first read lands, or while reading is forbidden. */
  readonly metadata: DocumentMetadata | null;
  /** The custom keys; `null` until the first read lands. */
  readonly custom: CustomMetadata | null;
  /** `idle` until something reads the state, then `loading` and `ready`, or `forbidden` or `error`. */
  readonly status: ResourceStatus;
}

export const metadataState = defineState(MetadataToken, {
  read: (metadata): MetadataState => ({
    metadata: metadata.getSnapshot(),
    custom: metadata.custom.getSnapshot(),
    status: metadata.getStatus(),
  }),
  empty: {
    metadata: null,
    custom: null,
    status: 'idle',
  },
  ensure: (metadata) => metadata.ensureLoaded(),
});
