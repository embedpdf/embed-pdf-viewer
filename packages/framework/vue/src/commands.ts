/**
 * @embedpdf/vue/commands: the Vue surface of `@embedpdf/plugin-commands`. The
 * standard commands, a command as a button needs it, the settings, and keyboard
 * shortcuts. A command's state is derived from live state on read, so
 * `useCommand` re-reads it on the kernel's one change stream and its ref
 * changes only when what the command shows changed.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-commands';
import { computed, toValue, watch } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { formatShortcut as formatKeys } from '@embedpdf/core-ui';
import { CommandsToken, boundCommandOf, resolvedCommandsEqual } from '@embedpdf/plugin-commands';
import type { BoundCommand, CommandsCapability } from '@embedpdf/plugin-commands';
import { CommandsToken as CommandsHostToken } from '@embedpdf/plugin-commands/contract/host';
import { createStandardCommands } from '@embedpdf/plugin-commands/standard';
import type { EventHook } from '@embedpdf/core';
import { bindCommandShortcuts, isMacPlatform, standardCommandsBrowser } from '@embedpdf/web';
import { useCapability, useCapabilityEvent } from './runtime/capabilities';
import { useDocumentId, useKernelValue } from './runtime/kernel';
import { settingsComposable } from './state';

/**
 * The commands every viewer has: zoom, pages, view rotation, `tool:<id>` for every tool, copy,
 * delete, download and print, with shortcuts and labels in EmbedPDF's eight languages. Spread
 * them into `commandsPlugin({ commands })`.
 */
export const standardCommands = /* @__PURE__ */ createStandardCommands(standardCommandsBrowser);

/** The commands API: `execute`, `searchCommands`, `registerCommand`, the categories, the settings calls. The object never changes. */
export function useCommands(): CommandsCapability {
  return useCapability(CommandsToken);
}

/** Subscribe to one commands event while the component lives: `useCommandsEvent((commands) => commands.onExecuted, handler)`. */
export function useCommandsEvent<Event>(
  select: (commands: CommandsCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(CommandsToken, select, handler);
}

/** The commands settings (`commands`, `disabledCategories`) as refs, with or without a document. Takes a selector. */
export const useCommandsSettings = settingsComposable(CommandsToken);

/** A shortcut as a tooltip shows it, for this platform: `'⌘K'` on a Mac, `'Ctrl+K'` elsewhere. */
export function formatShortcut(shortcut: string, options: { isMac?: boolean } = {}): string {
  return formatKeys(shortcut, { isMac: options.isMac ?? isMacPlatform() });
}

/**
 * A command for this component's document (the nearest `<DocumentScope>`, else
 * the active one), as a ref: its label, icon, state, `run` and `shortcut`, or
 * `null` for an unknown id. Pass a getter to follow a prop:
 * `useCommand(() => props.id)`. The ref changes only when what the command
 * shows does.
 */
export function useCommand(id: MaybeRefOrGetter<string>): Readonly<Ref<BoundCommand | null>> {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  const resolved = useKernelValue(
    () => commands.resolveCommand(toValue(id), documentId.value ?? undefined),
    resolvedCommandsEqual,
  );
  return computed(() => {
    const command = resolved.value;
    if (!command) return null;
    const scope = documentId.value ?? undefined;
    return boundCommandOf(
      command,
      (commandId) => commands.execute(commandId, { documentId: scope }),
      {
        isMac: isMacPlatform(),
      },
    );
  });
}

/** Where {@link useCommandShortcuts} listens, and how it reads `Mod`. */
export interface CommandShortcutsOptions {
  /** Whether `Mod` is Cmd (a Mac) or Ctrl. Default: what the browser says. */
  isMac?: MaybeRefOrGetter<boolean | undefined>;
  /**
   * Listen only while focus is inside this element (a template ref), for a
   * page with more than one viewer. The keys work once it has mounted.
   */
  target?: MaybeRefOrGetter<HTMLElement | null | undefined>;
}

/**
 * Turn every command's shortcut into a working key, for the active document.
 * Call it once, near the top of your viewer. Keys typed into text fields are
 * left alone, and so is a key whose command can't run now. The keys work
 * anywhere on the page; with `target`, only while focus is inside that element.
 * They stop when the component unmounts.
 */
export function useCommandShortcuts(options: CommandShortcutsOptions = {}): void {
  const commands = useCapability(CommandsHostToken);
  const scoped = options.target !== undefined;
  watch(
    () => [toValue(options.isMac), toValue(options.target)] as const,
    ([isMac, target], _previous, onCleanup) => {
      // A target that hasn't mounted yet binds nothing; its ref being set runs this again.
      if (scoped && !target) return;
      onCleanup(bindCommandShortcuts(commands, { isMac, target: target ?? undefined }));
    },
    { immediate: true, flush: 'post' },
  );
}
