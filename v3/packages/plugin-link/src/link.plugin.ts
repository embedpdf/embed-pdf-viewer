import { definePlugin } from '@embedpdf-x/kernel';
import { InteractionToken } from '@embedpdf-x/plugin-interaction';
import { StageToken } from '@embedpdf-x/plugin-stage';
import { AnnotationToken } from '@embedpdf-x/plugin-annotation';
// Behavior registration lives on the HOST capability (framework/plugin
// surface) — same runtime token, wider type. The form plugin's precedent.
import { AnnotationToken as AnnotationHostToken } from '@embedpdf-x/plugin-annotation/internal';

import { createLinkCapability } from './capability';
import { registerLinkEffects } from './effects';
import { initialLinkState, linkReducer } from './reducer';
import { LinkToken } from './types';
import type { LinkAction, LinkCapability, LinkPluginConfig, LinkState } from './types';

/**
 * The link plugin: the NAVIGATION plane. Document-scoped; requires only the
 * interaction hub. Navigation works with no annotation plugin at all —
 * links are read from the engine's link DTOs. When the annotation plugin IS
 * present, its folded model becomes the data source (no double fetch) and a
 * Behavior keeps links navigation-owned while a `link-nav` tool is active
 * (pointer/pan/form-fill by default) — the single-active-tool hub IS the
 * mode switch: grab the link tool and every link becomes an editable rect.
 */
export const linkPlugin = (config?: LinkPluginConfig) =>
  definePlugin<LinkState, LinkAction, LinkCapability>({
    id: 'link',
    token: LinkToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [StageToken, AnnotationToken],
    initialState: initialLinkState,
    reduce: linkReducer,
    capability: (ctx) => createLinkCapability(ctx, config),
    effects: registerLinkEffects,
    init: (ctx) => {
      const interaction = ctx.get(InteractionToken);
      const annotation = ctx.tryGet(AnnotationHostToken);
      if (annotation) {
        annotation.registerBehavior({
          id: 'link-nav',
          matches: (a) => a.subtype === 'link',
          engaged: () => interaction.activeTool()?.enables.has('link-nav') ?? false,
        });
      }
    },
  });
