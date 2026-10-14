/** The props of your own components' places in the viewer: `ToolbarItem`, `Panel`, `Region`. */
import type { Snippet } from 'svelte';

export interface ToolbarItemProps {
  /** The item's id: `{ custom: id }` in the layout. */
  id: string;
  children?: Snippet;
}

export interface PanelProps {
  /** The panel's id, as `addPanel(id, …)` names it in the layout. */
  id: string;
  children?: Snippet;
}

/**
 * A place around the viewer for your own components: `header` above everything, `footer` below
 * everything, `tabs` in place of the document tabs, `empty` over the pages while no document is
 * open.
 */
export type RegionName = 'header' | 'footer' | 'tabs' | 'empty';

export interface RegionProps {
  name: RegionName;
  children?: Snippet;
}
