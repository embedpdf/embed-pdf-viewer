import { definePlugin } from '@embedpdf/core';
import { ActionsToken as PublicActionsToken } from '@embedpdf/plugin-actions/contract';
import { FontsToken } from '@embedpdf/plugin-fonts/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { RenderToken } from '@embedpdf/plugin-render/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';

import { ANNOTATION_DEFAULTS, type AnnotationConfig } from './contract';
import { createAnnotationController } from './controller';
import { AnnotationToken } from './host-contract';
import { initialAnnotationState } from './model';

/**
 * The annotation plugin. Document-scoped; requires the interaction hub and
 * optionally uses the selection plugin: shapes and ink work without it, text
 * markup lights up only when it is present. The engine's pictures of its
 * annotations come through the render plugin; without it, what draws live
 * still draws. With the fonts plugin, text being typed shows in the font
 * programs the engine writes with. `config` is the settings the app
 * registers, over {@link ANNOTATION_DEFAULTS}.
 */
export const annotationPlugin = (config?: AnnotationConfig) =>
  definePlugin({
    id: 'annotation',
    token: AnnotationToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [SelectionToken, PublicActionsToken, RenderToken, FontsToken],
    state: initialAnnotationState,
    settings: { defaults: ANNOTATION_DEFAULTS, registered: config },
    create: createAnnotationController,
  });
