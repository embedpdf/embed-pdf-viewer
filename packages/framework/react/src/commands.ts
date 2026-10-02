/**
 * The React surface for @embedpdf/plugin-commands: the standard commands, a
 * command as a button needs it, the settings, and keyboard shortcuts. A
 * command's state is read from live state, so `useCommand` re-renders on the
 * kernel's one change stream, only when what the command shows changed.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-commands';
import { useEffect, useMemo, type RefObject } from 'react';
import { formatShortcut as formatKeys } from '@embedpdf/core-ui';
import { CommandsToken, boundCommandOf, resolvedCommandsEqual } from '@embedpdf/plugin-commands';
import type { BoundCommand, CommandsCapability } from '@embedpdf/plugin-commands';
import { CommandsToken as CommandsHostToken } from '@embedpdf/plugin-commands/contract/host';
import { createStandardCommands } from '@embedpdf/plugin-commands/standard';
import type { EventHook } from '@embedpdf/core';
import { bindCommandShortcuts, isMacPlatform, standardCommandsBrowser } from '@embedpdf/web';
import { useCapability, useCapabilityEvent, useDocumentId, useKernelValue } from './runtime';
import { settingsHook } from './state';

/**
 * The commands every viewer has: zoom, pages, view rotation, `tool:<id>` for every tool, copy,
 * delete, download and print, with shortcuts and labels in EmbedPDF's eight languages. Spread
 * them into `commandsPlugin({ commands })`.
 */
export const standardCommands = /* @__PURE__ */ createStandardCommands(standardCommandsBrowser);

/** The commands capability: `execute`, `searchCommands`, `registerCommand`, the categories, the settings calls. */
export function useCommands(): CommandsCapability {
  return useCapability(CommandsToken);
}

/** Subscribe to one commands event for the mounted lifetime: `useCommandsEvent((commands) => commands.onExecuted, handler)`. */
export function useCommandsEvent<T>(
  select: (commands: CommandsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(CommandsToken, select, handler);
}

/** The commands settings (`commands`, `disabledCategories`), with or without a document. Takes a selector. */
export const useCommandsSettings = settingsHook(CommandsToken);

/** A shortcut as a tooltip shows it, for this platform: `'⌘K'` on a Mac, `'Ctrl+K'` elsewhere. */
export function formatShortcut(shortcut: string, options: { isMac?: boolean } = {}): string {
  return formatKeys(shortcut, { isMac: options.isMac ?? isMacPlatform() });
}

/**
 * A command for this component's document (the nearest <DocumentScope>, else the active one):
 * its label, icon, state, `run` and `shortcut`. Re-renders when any of them changes; `null` for
 * an unknown id.
 */
export function useCommand(id: string): BoundCommand | null {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId() ?? undefined;
  const resolved = useKernelValue(
    () => commands.resolveCommand(id, documentId),
    resolvedCommandsEqual,
  );
  return useMemo(
    () =>
      resolved &&
      boundCommandOf(resolved, (commandId) => commands.execute(commandId, { documentId }), {
        isMac: isMacPlatform(),
      }),
    [resolved, commands, documentId],
  );
}

/**
 * Turn every command's shortcut into a working key, for the active document. Call it once, near
 * the top of your viewer. Keys typed into text fields are left alone, and so is a key whose
 * command can't run now. The keys work anywhere on the page; with `target`, only while focus is
 * inside that element, for a page with more than one viewer.
 */
export function useCommandShortcuts(options?: {
  isMac?: boolean;
  target?: RefObject<HTMLElement | null>;
}): void {
  const commands = useCapability(CommandsHostToken);
  const isMac = options?.isMac;
  const target = options?.target;
  useEffect(() => {
    if (!target) return bindCommandShortcuts(commands, { isMac });
    // The element mounts before this effect runs, so its ref is set by now.
    return target.current
      ? bindCommandShortcuts(commands, { isMac, target: target.current })
      : undefined;
  }, [commands, isMac, target]);
}
