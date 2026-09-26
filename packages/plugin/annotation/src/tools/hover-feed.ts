import type { ModelAnnotation } from '@embedpdf/core-annotation';
import { createHoverPump } from '@embedpdf/plugin-actions/contract';
import type { ActionsCapability, HoverTarget } from '@embedpdf/plugin-actions/contract';

export interface AnnotationHoverFeed {
  /** Report the pointer-driven hover target (the hoverAt diff's new id). */
  hover(id: string | null): void;
}

/**
 * The annotation plane's E/X trigger feed — a thin adapter from the one
 * pointer-driven hover seam (the `hoverAt` diff) onto the shared hover pump.
 *
 * Anti-cascade is structural and lives in the caller's seam placement:
 * reducer-side hover clears (session-hide, remove, reload) never pass
 * through `hoverAt`, so an effect-induced hover loss can never masquerade as
 * a cursor exit. This module only decides who is hoverable here:
 *
 * - Drafts (no engine ref) can't carry /AA — skipped.
 * - Widgets and links belong to their own event planes (fill controls /
 *   LinkLayer anchors own their pixels). When they are hit-testable on this
 *   plane, an authoring tool owns them — firing hover actions while editing
 *   would be wrong — so they are skipped unconditionally.
 * - Tree-less annotations are free: no target, no dispatch, and per-event
 *   flags keep a lone /E or /X from dispatching its inert twin.
 */
export function createAnnotationHoverFeed(
  actions: ActionsCapability,
  annotOf: (id: string) => ModelAnnotation | null,
): AnnotationHoverFeed {
  const pump = createHoverPump(actions.dispatch);

  const targetOf = (id: string | null): HoverTarget | null => {
    if (!id) return null;
    const annotation = annotOf(id);
    if (!annotation?.ref) return null;
    if (annotation.subtype.startsWith('widget') || annotation.subtype === 'link') return null;
    const enter = Boolean(annotation.data?.actions?.cursorEnter?.root);
    const exit = Boolean(annotation.data?.actions?.cursorExit?.root);
    if (!enter && !exit) return null;
    return { ref: annotation.ref, page: annotation.page, events: { enter, exit } };
  };

  return {
    hover: (id) => pump.hover(targetOf(id)),
  };
}
