import { definePlugin } from '@embedpdf/core';
import { createMetadataCapability } from './capability';
import { registerMetadataEffects } from './effects';
import { initialMetadataState, metadataReducer } from './reducer';
import { MetadataToken } from './types';
import type { MetadataAction, MetadataCapability, MetadataState } from './types';

/**
 * Document-scoped metadata plugin: reactive Info-dict state. The effect seeds it
 * from the engine and keeps it live off the document event stream (own + remote
 * SSE edits); the capability is the read/write surface.
 */
export const metadataPlugin = () =>
  definePlugin<MetadataState, MetadataAction, MetadataCapability>({
    id: 'metadata',
    token: MetadataToken,
    scope: 'document',
    initialState: initialMetadataState,
    reduce: metadataReducer,
    capability: createMetadataCapability,
    effects: registerMetadataEffects,
  });
