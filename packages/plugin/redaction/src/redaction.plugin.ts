import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/internal';
import { InteractionToken } from '@embedpdf/plugin-interaction';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { createRedactionCapability } from './capability';
import { initialRedactionState, redactionReducer } from './reducer';
import { RedactionToken } from './types';
import type { RedactionAction, RedactionCapability, RedactionState } from './types';

/**
 * Document-scoped redaction plugin — the DESTRUCTIVE half of the two-stage
 * model. Marking is annotation-plane work (the composed `redact` tool ships
 * with plugin-annotation); this plugin wraps `doc.redaction.apply`, projects
 * the pending queue out of annotation state, and estimates collateral for
 * confirm dialogs. It owns no mark state of its own.
 *
 * Trust boundary: on a layered document, applying rewrites the LAYER's bytes;
 * the immutable base keeps the original. See the package README.
 */
export const redactionPlugin = () =>
  definePlugin<RedactionState, RedactionAction, RedactionCapability>({
    id: 'redaction',
    token: RedactionToken,
    scope: 'document',
    requires: [AnnotationToken],
    optional: [InteractionToken, SelectionToken],
    initialState: initialRedactionState,
    reduce: redactionReducer,
    capability: createRedactionCapability,
  });
