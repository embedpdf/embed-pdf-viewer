/**
 * @embedpdf/svelte/actions — the action engine's UI port.
 *
 * The plugin has no DOM: opening a website, printing and showing an alert are this layer's job.
 * `useActionsUiAdapter()` installs the browser's defaults (the same sanitizer and `window.open`
 * the link layer uses; print is the browser's dialog), and you can replace any of them. Without
 * it, actions routed to the adapter (a website, a print) report a `no-adapter` diagnostic instead
 * of running. The other readers are the plugin's: `useActions()` (the API),
 * `useActionsSettings()` and `useActionsEvent()`.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-actions';

export {
  useActions,
  useActionsEvent,
  useActionsSettings,
  useActionsUiAdapter,
} from './actions/readers.svelte';
export type { ActionsUiHandlers } from './actions/readers.svelte';
