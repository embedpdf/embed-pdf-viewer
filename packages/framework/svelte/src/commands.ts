/**
 * @embedpdf/svelte/commands — commands as buttons, shortcuts and a palette.
 *
 * The readers are the commands plugin's API, settings and events; `useCommand()` gives a command
 * with everything a button needs, and `useCommandShortcuts()` turns every shortcut into a key.
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-commands';

export {
  formatShortcut,
  standardCommands,
  useCommand,
  useCommandShortcuts,
  useCommands,
  useCommandsEvent,
  useCommandsSettings,
} from './commands/readers.svelte';
export type { CommandShortcutsOptions } from './commands/readers.svelte';
