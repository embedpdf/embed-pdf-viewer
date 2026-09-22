/**
 * The annotation plugin's wiring, run once every capability exists: the
 * widget-repaint reaction, its tools and pointer handlers on the interaction
 * hub, the markup bridge to the selection plugin, and the annotation commit
 * sink on the actions plugin. Every registration is released with the document.
 */
import { ActionsToken as ActionsHostToken } from '@embedpdf/plugin-actions/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract/host';
import { SelectionToken } from '@embedpdf/plugin-selection/contract/host';

import type { AnnotationHostCapability } from './host-contract';
import type { AnnotationContext, AnnotationServices } from './services';
import { widgetsRepaintedBy } from './sync/records';
import { ARMED_STAMP_TOOL_ID, isTouchDirect } from './tools/definitions';
import {
  createDrawHandler,
  createEditHandler,
  createGhostHandler,
  createMarqueeHandler,
  createPlaceHandler,
} from './tools/handlers';
import { wireMarkup } from './tools/markup-bridge';

export function connectAnnotation(
  ctx: AnnotationContext,
  annotation: AnnotationHostCapability,
  { store }: Pick<AnnotationServices, 'store'>,
): void {
  // Form writes and signatures repaint widgets without changing any
  // annotation record: bump those widgets' appearance versions so their
  // rasters re-fetch.
  ctx.listen(ctx.doc.events, (event) => {
    const ids = widgetsRepaintedBy(event);
    if (ids.length) store.commit({ type: 'bumpAp', ids });
  });

  const interaction = ctx.get(InteractionToken);
  const selection = ctx.tryGet(SelectionToken);

  // Script effects that hide or show annotations are written through this plugin.
  const actions = ctx.tryGet(ActionsHostToken);
  if (actions) {
    ctx.cleanup(
      actions.registerAnnotCommitSink((entries) => annotation.commitScriptEffects(entries)),
    );
  }

  // Register every resolved tool (built-ins plus the embedder's) and seed its
  // defaults. Markup and caret tools ride the selection plugin's text-select
  // gesture, so they are skipped when there is no selection plugin. A tool a
  // sibling already registered on the hub (the form palette) is left alone.
  for (const tool of annotation.listResolvedTools()) {
    if (tool.enables.has('text-select') && !selection) continue;
    if (interaction.hasTool(tool.id)) continue;
    ctx.cleanup(
      interaction.registerTool({
        id: tool.id,
        cursor: tool.cursor,
        enables: tool.enables,
        // Drag-create tools own single-finger touch; click-place tools do not.
        touchDirect: isTouchDirect(tool.enables),
      }),
    );
    if (tool.defaults) annotation.setToolDefaults(tool.id, tool.defaults);
  }

  for (const handler of [
    createPlaceHandler(annotation),
    createGhostHandler(annotation, interaction),
    createEditHandler(annotation, interaction),
    createMarqueeHandler(annotation),
    createDrawHandler(annotation, interaction),
  ]) {
    ctx.cleanup(interaction.registerHandler(handler));
  }

  ctx.listen(interaction.onToolChanged, () => {
    annotation.cancel();
    // A footprint ghost belongs to the tool that computed it.
    annotation.clearGhost();
    // Annotations whose behavior just engaged (form widgets under a fill
    // tool) leave the selection, so no chrome is stranded on a fill control.
    annotation.pruneEngagedSelection();
    // Leaving the armed stamp's own tool drops the payload: the bytes belong
    // to the tool, not the document. The legacy-free check is the tool id;
    // embedder tools tagged 'annotation-stamp' also hold a payload.
    const active = interaction.getActiveTool();
    if (active.id !== ARMED_STAMP_TOOL_ID && !active.enables.has('annotation-stamp')) {
      annotation.disarmStamp();
    }
  });

  // The selection → markup bridge exists only when a selection plugin does.
  if (selection) wireMarkup(annotation, selection, interaction);
}
