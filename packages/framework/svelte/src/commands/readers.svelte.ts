/**
 * The commands plugin's readers: its API, settings and events, a command as a button needs it,
 * and keyboard shortcuts. A command's state is derived from live state on read, so `useCommand`
 * reads it again after every kernel change and passes it on only when what it shows changed.
 */
import { untrack } from 'svelte';
import type { EventHook } from '@embedpdf/core';
import { formatShortcut as formatKeys } from '@embedpdf/core-ui';
import { CommandsToken, boundCommandOf, resolvedCommandsEqual } from '@embedpdf/plugin-commands';
import type { BoundCommand, CommandsCapability } from '@embedpdf/plugin-commands';
import { CommandsToken as CommandsHostToken } from '@embedpdf/plugin-commands/contract/host';
import { createStandardCommands } from '@embedpdf/plugin-commands/standard';
import { bindCommandShortcuts, isMacPlatform, standardCommandsBrowser } from '@embedpdf/web';
import {
  useCapability,
  useCapabilityEvent,
  useDocumentId,
  useKernelValue,
} from '../runtime/readers.svelte';
import { settingsReader } from '../runtime/state.svelte';
import {
  currentOf,
  derivedValue,
  valueOf,
  type CurrentValue,
  type MaybeGetter,
} from '../runtime/values.svelte';

/**
 * The commands every viewer has: zoom, pages, view rotation, `tool:<id>` for every tool, copy,
 * delete, download and print, with shortcuts and labels in EmbedPDF's eight languages. Spread
 * them into `commandsPlugin({ commands })`.
 */
export const standardCommands = /* @__PURE__ */ createStandardCommands(standardCommandsBrowser);

/** The commands API: `execute`, `searchCommands`, `registerCommand`, the categories, the settings calls. */
export function useCommands(): CommandsCapability {
  return useCapability(CommandsToken);
}

/** Subscribe to one commands event while the component lives: `useCommandsEvent((commands) => commands.onExecuted, handler)`. */
export function useCommandsEvent<T>(
  select: (commands: CommandsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(CommandsToken, select, handler);
}

/** The commands settings (`commands`, `disabledCategories`), with or without a document. Takes a selector. */
export const useCommandsSettings = settingsReader(CommandsToken);

/** A shortcut as a tooltip shows it, for this platform: `'⌘K'` on a Mac, `'Ctrl+K'` elsewhere. */
export function formatShortcut(shortcut: string, options: { isMac?: boolean } = {}): string {
  return formatKeys(shortcut, { isMac: options.isMac ?? isMacPlatform() });
}

/**
 * A command for this component's document (the nearest `<DocumentScope>`, else the active one),
 * as `{ current }`: its label, icon, state, `run` and `shortcut`, or `null` for an unknown id.
 * Pass the id as a function to follow a prop: `useCommand(() => id)`. `current` changes only
 * when what the command shows does.
 */
export function useCommand(id: MaybeGetter<string>): CurrentValue<BoundCommand | null> {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const resolved = useKernelValue(
    () => commands.resolveCommand(valueOf(id), documentId.current ?? undefined),
    resolvedCommandsEqual,
  );
  // A new object only when the resolved command or the document changes.
  return currentOf(
    derivedValue(() => {
      const command = resolved.current;
      if (!command) return null;
      const scope = documentId.current ?? undefined;
      return boundCommandOf(
        command,
        (commandId) => commands.execute(commandId, { documentId: scope }),
        { isMac: isMacPlatform() },
      );
    }),
  );
}

/** Where {@link useCommandShortcuts} listens, and how it reads `Mod`. */
export interface CommandShortcutsOptions {
  /** Whether `Mod` is Cmd (a Mac) or Ctrl. Default: what the browser says. */
  isMac?: MaybeGetter<boolean | undefined>;
  /**
   * Listen only while focus is inside this element, for a page with more than one viewer. Pass a
   * function (`() => area`, with `bind:this={area}`): the keys work once the element has mounted.
   */
  target?: MaybeGetter<HTMLElement | null | undefined>;
}

/**
 * Turn every command's shortcut into a working key, for the active document. Call it once, near
 * the top of your viewer. Keys typed into text fields are left alone, and so is a key whose
 * command can't run now. The keys work anywhere on the page; with `target`, only while focus is
 * inside that element. They stop when the component goes away.
 */
export function useCommandShortcuts(options: CommandShortcutsOptions = {}): void {
  const commands = useCapability(CommandsHostToken);
  const scoped = options.target !== undefined;
  $effect(() => {
    const isMac = valueOf(options.isMac);
    const target = valueOf(options.target);
    // A target that hasn't mounted yet binds nothing; this runs again once it has.
    if (scoped && !target) return;
    return untrack(() => bindCommandShortcuts(commands, { isMac, target: target ?? undefined }));
  });
}
