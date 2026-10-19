/**
 * The annotation plugin's wiring, run once every capability exists: its tools
 * and pointer handlers on the interaction hub, the markup bridge to the
 * selection plugin, and the annotation commit sink on the actions plugin.
 * Every registration is released with the document.
 */
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';

import type { AnnotationHostCapability } from './host-contract';
import type { AnnotationContext } from './services';
import { ARMED_STAMP_TOOL_ID, toolTouchOf } from './tools/definitions';
import {
  createDrawHandler,
  createEditHandler,
  createMarqueeHandler,
  createPlaceHandler,
} from './tools/handlers';
import { wireMarkup } from './tools/markup-bridge';

export function connectAnnotation(
  ctx: AnnotationContext,
  annotation: AnnotationHostCapability,
): void {
  const interaction = ctx.get(InteractionToken);
  const selection = ctx.tryGet(SelectionToken);

  // Script effects that hide or show annotations are written through this plugin.
  const actions = ctx.tryGet(ActionsHostToken);
  if (actions) {
    ctx.cleanup(
      actions.registerAnnotCommitSink((entries) => annotation.commitScriptEffects(entries)),
    );
  }

  // Register every resolved tool (built-ins plus the embedder's; the registry
  // seeded their defaults). Markup and caret tools ride the selection plugin's
  // text-select gesture, so they are skipped when there is no selection
  // plugin. A tool a sibling already registered on the hub (the form palette)
  // is left alone.
  for (const tool of annotation.listResolvedTools()) {
    if (tool.enables.has('text-select') && !selection) continue;
    if (interaction.hasTool(tool.id)) continue;
    ctx.cleanup(
      interaction.registerTool({
        id: tool.id,
        cursor: tool.cursor,
        enables: tool.enables,
        // Drag-create tools own single-finger touch; click-place tools do not.
        touch: toolTouchOf(tool.enables),
      }),
    );
  }

  for (const handler of [
    createPlaceHandler(annotation, interaction),
    createEditHandler(annotation, interaction),
    createMarqueeHandler(annotation),
    createDrawHandler(annotation, interaction, ctx.clock, (flush) => ctx.onSettle(flush)),
  ]) {
    ctx.cleanup(interaction.registerHandler(handler));
  }

  ctx.listen(interaction.onToolChanged, () => {
    annotation.cancel();
    // A ghost belongs to the tool that showed it.
    annotation.clearGhost();
    // Annotations whose behavior just engaged (form widgets under a fill
    // tool) leave the selection, so no chrome is stranded on a fill control.
    annotation.pruneEngagedSelection();
    // Leaving the armed stamp's own tool drops the payload: the bytes belong
    // to the tool, not the document. The legacy-free check is the tool id;
    // embedder tools tagged 'annotation-stamp' also hold a payload.
    const active = interaction.getActiveTool();
    if (active.id !== ARMED_STAMP_TOOL_ID && !active.enables.has('annotation-stamp')) {
      annotation.stamps.disarm();
    }
  });

  // The selection → markup bridge exists only when a selection plugin does.
  if (selection) wireMarkup(annotation, selection, interaction);
}
