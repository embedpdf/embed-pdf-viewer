/**
 * The viewer's own components, for yours: `Button`, `Menu` and `MenuItem` render the viewer's
 * `<epdf-button>`, `<epdf-menu>` and `<epdf-menu-item>` elements, which the viewer draws like its
 * own toolbar buttons and menus. Use them inside the viewer: in a `ToolbarItem`, a `Panel` or a
 * `Region`. The elements come with the viewer, so these import nothing from it.
 */
export { default as Button } from './viewer-components/Button.svelte';
export { default as Menu } from './viewer-components/Menu.svelte';
export { default as MenuItem } from './viewer-components/MenuItem.svelte';
export type { ButtonProps, MenuItemProps, MenuProps } from './viewer-components/props';
