/** The props of `<Anchored>`. */
import type { Snippet } from 'svelte';
import type { AnchoredPlacement, AnchoredRect, AnchorTarget } from '@embedpdf/web';

export interface AnchoredProps {
  /**
   * The box on a page to sit next to, in page coordinates: `{ page, bounds }`, with `avoid`
   * points to keep clear of. `null`, or a target without `bounds` (a search match with no
   * geometry), hides it.
   */
  anchor: (Omit<AnchorTarget, 'bounds'> & { bounds?: AnchoredRect }) | null;
  /**
   * Where to sit: a side of the box, centred, or lined up with the side's start or end
   * (`'top-end'`). Default `'top'`.
   */
  placement?: AnchoredPlacement;
  /**
   * The gap in screen pixels between the box and the content, and between the content and the
   * view's edge. Negative overlaps the box. Default 8.
   */
  gap?: number;
  /**
   * Stay where `placement` puts it: never flip to the other side, never move to stay in view,
   * and scroll away with the box. For badges and status; menus leave it off. Default false.
   */
  pinned?: boolean;
  children?: Snippet;
}
