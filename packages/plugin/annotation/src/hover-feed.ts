import { createHoverPump } from '@embedpdf/plugin-actions';
import type { ActionsCapability, HoverTarget } from '@embedpdf/plugin-actions';
import type { Annot } from '@embedpdf/core-annotation';

export interface AnnotationHoverFeed {
  /** Report the pointer-driven hover target (the hoverAt diff's new id). */
  hover(id: string | null): void;
}

/**
 * The annotation plane's E/X trigger feed — a thin adapter from the ONE
 * pointer-driven hover seam (the `hoverAt` diff) onto the shared hover pump.
 *
 * Anti-cascade is structural and lives in the CALLER's seam placement:
 * reducer-side hover clears (session-hide, remove, reload) never pass
 * through `hoverAt`, so an effect-induced hover loss can never masquerade as
 * a cursor exit. This module only decides WHO is hoverable here:
 *
 * - Drafts (no engine ref) can't carry /AA — skipped.
 * - Widgets and links belong to their own event planes (fill controls /
 *   LinkLayer anchors own their pixels). When they ARE hit-testable on this
 *   plane, an authoring tool owns them — firing hover actions while editing
 *   would be wrong — so they are skipped unconditionally.
 * - Tree-less annotations are FREE: no target, no dispatch, and per-event
 *   flags keep a lone /E or /X from dispatching its inert twin.
 */
export function createAnnotationHoverFeed(
  actions: ActionsCapability,
  annotOf: (id: string) => Annot | null,
): AnnotationHoverFeed {
  const pump = createHoverPump(actions.dispatch);

  const targetOf = (id: string | null): HoverTarget | null => {
    if (!id) return null;
    const annot = annotOf(id);
    if (!annot?.ref) return null;
    if (annot.subtype.startsWith('widget') || annot.subtype === 'link') return null;
    const enter = Boolean(annot.data?.actions?.cursorEnter?.root);
    const exit = Boolean(annot.data?.actions?.cursorExit?.root);
    if (!enter && !exit) return null;
    return { ref: annot.ref, pon: annot.pon, events: { enter, exit } };
  };

  return {
    hover: (id) => pump.hover(targetOf(id)),
  };
}
