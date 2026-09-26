import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { SearchToken } from '@embedpdf/plugin-search/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';

import type { RedactionConfig } from './contract';
import { createRedactionController } from './controller';
import { RedactionToken } from './host-contract';
import type { RedactionHostCapability } from './host-contract';
import { initialRedactionState, redactionReducer } from './model';
import type { RedactionAction, RedactionState } from './model';

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
export const redactionPlugin = (config: RedactionConfig = {}) =>
  definePlugin<RedactionState, RedactionAction, RedactionHostCapability>({
    id: 'redaction',
    token: RedactionToken,
    scope: 'document',
    requires: [AnnotationToken],
    optional: [SelectionToken, SearchToken],
    initialState: initialRedactionState,
    reduce: redactionReducer,
    create: (ctx) => createRedactionController(ctx, config),
  });
