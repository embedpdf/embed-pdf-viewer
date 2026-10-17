/** The props of `<LinkLayer>`. */
import type { Snippet } from 'svelte';
import type { Link } from '@embedpdf/plugin-link';

/** What the `link` snippet receives for each link. */
export interface LinkRenderProps {
  /** The link: its `id`, its `bounds` on the page and its `target`. */
  link: Link;
  /** The layer's own clickable area, `{@render native()}`: wrap it to keep what a click does. */
  native: Snippet;
}

export interface LinkLayerProps {
  /**
   * Draw each link yourself, usually around `{@render native()}`. To leave a link as it is,
   * render only `native` for it.
   */
  link?: Snippet<[props: LinkRenderProps]>;
}
