/**
 * @embedpdf/svelte/shell — panels, dialogs and menus.
 *
 * Your app draws every surface; the readers bind whether each one is open (and its props) to the
 * kernel, so commands can open them and a layout can be saved and restored.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-shell';

export { useShell, useShellEvent, useShellState, useSurface } from './shell/readers.svelte';
export type { SurfaceHandle } from './shell/readers.svelte';
