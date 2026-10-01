import { definePlugin } from '@embedpdf/core';
import { ActionsToken as PublicActionsToken } from '@embedpdf/plugin-actions/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';

import { ANNOTATION_DEFAULTS, type AnnotationConfig } from './contract';
import { createAnnotationController } from './controller';
import { AnnotationToken } from './host-contract';
import { initialAnnotationState } from './model';

/**
 * The annotation plugin. Document-scoped; requires the interaction hub and
 * optionally uses the selection plugin: shapes and ink work without it, text
 * markup lights up only when it is present. `config` is the settings the app
 * registers, over {@link ANNOTATION_DEFAULTS}.
 */
export const annotationPlugin = (config?: AnnotationConfig) =>
  definePlugin({
    id: 'annotation',
    token: AnnotationToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [SelectionToken, PublicActionsToken],
    state: initialAnnotationState,
    settings: { defaults: ANNOTATION_DEFAULTS, registered: config },
    create: createAnnotationController,
  });
