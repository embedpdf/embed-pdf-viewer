/**
 * @embedpdf/svelte/shell — panels, dialogs and menus.
 *
 * Your app draws every surface; the readers bind whether each one is open (and its props) to the
 * kernel, so commands can open them and a layout can be saved and restored. `surfaceFocus` puts
 * the cursor in a panel's element when the panel asks for it.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-shell';

export { useShell, useShellEvent, useShellState, useSurface } from './shell/readers.svelte';
export type { SurfaceHandle } from './shell/readers.svelte';
export { surfaceFocus } from './shell/surface-focus.svelte';
export type { SurfaceFocusOptions } from './shell/surface-focus.svelte';
