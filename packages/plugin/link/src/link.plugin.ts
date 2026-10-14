import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { createLinkController } from './controller';
import { LinkToken } from './host-contract';

/**
 * Clickable link regions and their activation. Document-scoped; needs the
 * interaction hub (the navigation tool tag), optionally the stage (reveal),
 * the annotation plugin (the folded link model) and actions (`/A` trees).
 */
export const linkPlugin = () =>
  definePlugin({
    id: 'link',
    token: LinkToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [StageToken, AnnotationToken, ActionsToken],
    create: createLinkController,
  });
