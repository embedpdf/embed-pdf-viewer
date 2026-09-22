/** The link plugin's wiring to its siblings, run from the controller's `connect`. */
import type { PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

/**
 * Links are annotations: while a navigation tool is active the link layer
 * owns their pixels, so the annotation plugin's behavior for them stands down.
 */
export function connectLink(ctx: PluginContext<void>): void {
  const annotation = ctx.tryGet(AnnotationToken);
  if (!annotation) return;
  const interaction = ctx.get(InteractionToken);
  ctx.cleanup(
    annotation.registerBehavior({
      id: 'link-nav',
      matches: (target) => target.subtype === 'link',
      engaged: () => interaction.getActiveTool()?.enables.has('link-nav') ?? false,
    }),
  );
}
