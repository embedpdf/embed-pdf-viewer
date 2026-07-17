import { definePlugin } from '@embedpdf-x/kernel';
import { InteractionToken } from '@embedpdf-x/plugin-interaction';
import { SelectionToken } from '@embedpdf-x/plugin-selection';
import { createAnnotationCapability } from './capability';
import { registerAnnotationEffects } from './effects';
import {
  createDrawHandler,
  createEditHandler,
  createGhostHandler,
  createMarqueeHandler,
  createPlaceHandler,
} from './handler';
import { wireMarkup } from './markup';
import { annotationReducer, initialAnnotationState } from './reducer';
import { AnnotationToken } from './types';
import type {
  AnnotationAction,
  AnnotationConfig,
  AnnotationHostCapability,
  AnnotationState,
} from './types';

/**
 * The annotation plugin. Document-scoped; requires the interaction hub and
 * OPTIONALLY uses the selection plugin. Shapes/ink work with no selection; text
 * markup lights up only when a selection plugin is present.
 */
export const annotationPlugin = (config: AnnotationConfig = {}) =>
  definePlugin<AnnotationState, AnnotationAction, AnnotationHostCapability>({
    id: 'annotation',
    token: AnnotationToken,
    scope: 'document',
    requires: [InteractionToken],
    optional: [SelectionToken],
    initialState: () => initialAnnotationState(config),
    reduce: annotationReducer,
    // The capability owns the resolved tool registry (built-ins + config `tools`),
    // so it needs the config too — not just the reducer state.
    capability: (ctx) => createAnnotationCapability(ctx, config),
    // Fold in remote collaborators' edits (own edits flow through the capability).
    effects: registerAnnotationEffects,
    init: (ctx) => {
      const interaction = ctx.get(InteractionToken);
      const annotation = ctx.get(AnnotationToken);
      const selection = ctx.tryGet(SelectionToken);

      // Register every resolved tool (shapes, lines, ink, free-text, markup, stamp,
      // plus anything the embedder added via config `tools`) and seed its defaults.
      // A tool is a named preset over a subtype — see `tools.ts`. Markup / caret
      // tools ride the selection plugin's `text-select` gesture, so they stay
      // inert (skipped) when no selection plugin is installed.
      for (const tool of annotation.tools()) {
        if (tool.enables.has('text-select') && !selection) continue;
        interaction.registerTool({ id: tool.id, cursor: tool.cursor, enables: tool.enables });
        if (tool.defaults) annotation.setDefaults(tool.preset, tool.defaults);
      }

      interaction.registerHandler(createPlaceHandler(annotation));
      interaction.registerHandler(createGhostHandler(annotation, interaction));
      interaction.registerHandler(createEditHandler(annotation, interaction));
      interaction.registerHandler(createMarqueeHandler(annotation));
      interaction.registerHandler(createDrawHandler(annotation, interaction));
      interaction.onToolChange(() => {
        annotation.cancel();
        annotation.clearGhost(); // a footprint belongs to the tool that computed it
        // Engagement follows the tool: annotations whose Behavior just engaged
        // (form widgets under a fill tool) drop out of the selection — no
        // stranded chrome on a fill control.
        annotation.pruneEngagedSelection();
        // Leaving the stamp family drops any armed payload — bytes are tool state,
        // not document state (any stamp tool keeps it; a non-stamp tool clears it).
        if (!interaction.activeTool().enables.has('annotation-stamp')) annotation.disarmStamp();
      });

      // Markup is opt-in: wire the selection→annotation BRIDGE only when a
      // selection plugin is present (the markup TOOLS were registered above).
      if (selection) wireMarkup(annotation, selection, interaction);
    },
  });
