import { definePlugin } from '@embedpdf/core';
import { ActionsToken as PublicActionsToken } from '@embedpdf/plugin-actions/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';

import type { AnnotationConfig } from './contract';
import { createAnnotationController } from './controller';
import { AnnotationToken, type AnnotationHostCapability } from './host-contract';
import { initialAnnotationState, type AnnotationState } from './model';

/**
 * The annotation plugin. Document-scoped; requires the interaction hub and
 * optionally uses the selection plugin: shapes and ink work without it, text
 * markup lights up only when it is present.
 */
export const annotationPlugin = (config: AnnotationConfig = {}) =>
  definePlugin<AnnotationState, AnnotationHostCapability>({
    id: 'annotation',
    token: AnnotationToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [SelectionToken, PublicActionsToken],
    state: () => initialAnnotationState(config),
    create: (ctx) => createAnnotationController(ctx, config),
  });
