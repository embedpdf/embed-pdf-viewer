import type { Snippet } from 'svelte';
import type { AnchoredPlacement } from '@embedpdf/web';

/** The props of `<RenderLayer>`. */
export interface RenderLayerProps {
  /**
   * Draw the annotations into the page's picture (`true`) or leave them out (`false`). Left
   * unset, the picture leaves them to an `<AnnotationLayer>` on the page, and otherwise draws them
   * when the user may read them.
   */
  annotations?: boolean;
  /** The same for the form fields, which a `<FormLayer>` paints. */
  formFields?: boolean;
  /**
   * Mount the tile plane (default true). Whether it spends anything is the render plugin's
   * arithmetic: leave it on, and pass false only for a view that must never tile.
   */
  tiles?: boolean;
  /**
   * Draw the page's thumbnail instead: one small picture of the whole page, without tiles, which
   * needs only `doc.render.thumbnail` (a strip of thumbnails, a page picker).
   */
  thumbnail?: boolean;
}

/** The props of `<SnapshotMenu>`. */
export interface SnapshotMenuProps {
  /** The menu: buttons that call `useSnapshot()`, `copyImage()` and `saveFile()`. */
  children: Snippet;
  /** The gap in screen pixels between the box and the menu. Default 8. */
  gap?: number;
  /** Where the menu sits next to the box. Default `'bottom'`. */
  placement?: AnchoredPlacement;
}
