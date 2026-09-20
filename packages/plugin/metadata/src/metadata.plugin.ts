import { definePlugin } from '@embedpdf/core';
import { MetadataToken, type MetadataCapability } from './contract';
import { createMetadataController } from './controller';
import {
  initialMetadataState,
  reduceMetadata,
  type MetadataAction,
  type MetadataState,
} from './model';

/** Document-scoped, reactive Info-dict metadata. Takes no configuration. */
export const metadataPlugin = () =>
  definePlugin<MetadataState, MetadataAction, MetadataCapability>({
    id: 'metadata',
    token: MetadataToken,
    scope: 'document',
    initialState: initialMetadataState,
    reduce: reduceMetadata,
    create: createMetadataController,
  });
