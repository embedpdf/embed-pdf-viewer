/**
 * Your own components in the viewer: `ToolbarItem`, `Panel` and `Region` put your component in
 * the place the viewer makes for it (`item:<id>`, `panel:<id>`, or a region's name). It renders as
 * a child of the `<embedpdf-viewer>` element, so it stays in your Svelte tree, with your context,
 * your state and your CSS; the browser shows it in that place. `useToolbarItem()` tells a
 * component inside a `ToolbarItem` where it sits.
 */
export { default as ToolbarItem } from './slots/ToolbarItem.svelte';
export { default as Panel } from './slots/Panel.svelte';
export { default as Region } from './slots/Region.svelte';
export { useToolbarItem } from './slots/item-context.svelte';
export type { PanelProps, RegionName, RegionProps, ToolbarItemProps } from './slots/props';
