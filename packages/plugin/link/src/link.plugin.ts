import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { AnnotationToken as AnnotationHostToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';
import { createLinkController } from './controller';
import { initialLinkState, linkReducer } from './model';
import { LinkToken } from './host-contract';
import type { LinkHostCapability } from './host-contract';
import type { LinkAction, LinkState } from './model';

/**
 * Clickable link regions and their activation. Document-scoped; needs the
 * interaction hub (the navigation tool tag), optionally the stage (reveal),
 * the annotation plugin (the folded link model) and actions (`/A` trees).
 */
export const linkPlugin = () =>
  definePlugin<LinkState, LinkAction, LinkHostCapability>({
    id: 'link',
    token: LinkToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [StageToken, AnnotationToken, ActionsToken],
    initialState: initialLinkState,
    reduce: linkReducer,
    create: (ctx) => {
      const { api, connect } = createLinkController(ctx);
      return {
        api,
        connect() {
          connect();
          // Links are annotations: while a navigation tool is active the
          // link plane owns their pixels, so the annotation plane stands down.
          const interaction = ctx.get(InteractionToken);
          const annotation = ctx.tryGet(AnnotationHostToken);
          if (annotation) {
            annotation.registerBehavior({
              id: 'link-nav',
              matches: (a) => a.subtype === 'link',
              engaged: () => interaction.getActiveTool()?.enables.has('link-nav') ?? false,
            });
          }
        },
      };
    },
  });
