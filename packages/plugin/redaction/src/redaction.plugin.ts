import { definePlugin } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { SearchToken } from '@embedpdf/plugin-search/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';

import { REDACTION_DEFAULTS, RedactionToken, type RedactionConfig } from './contract';
import { createRedactionController } from './controller';
import { initialRedactionState } from './model';

/**
 * Document-scoped redaction plugin: the destructive half of the two-stage
 * model. Marking is annotation work (the composed `redact` tool ships with
 * plugin-annotation); this plugin wraps `doc.redaction.apply`, projects the
 * pending queue out of annotation state, and estimates collateral for
 * confirm dialogs. It owns no mark state of its own.
 *
 * Trust boundary: on a layered document, applying rewrites the layer's bytes;
 * the immutable base keeps the original. The package README explains the consequences.
 * `config` is the settings the app registers, over {@link REDACTION_DEFAULTS}.
 */
export const redactionPlugin = (config?: RedactionConfig) =>
  definePlugin({
    id: 'redaction',
    token: RedactionToken,
    scope: 'document',
    requires: [AnnotationToken],
    optional: [SelectionToken, SearchToken],
    state: initialRedactionState,
    settings: { defaults: REDACTION_DEFAULTS, registered: config },
    create: createRedactionController,
  });
