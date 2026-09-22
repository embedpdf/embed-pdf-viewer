/**
 * The React surface for @embedpdf/plugin-commands.
 *
 * Command state is a pure derivation over the store, so these hooks are thin:
 * `useCommand` re-resolves on the kernel's one change stream (cached by value
 * equality — locale flips, permission changes, and active-tool changes all
 * propagate with zero events), and `useCommandShortcuts` is the ~20 lines of
 * DOM that turn the registry's pure stroke matcher into a live keymap.
 */

// One-line-per-feature: registration travels with the UI.
// (resolvedCommandsEqual lives in the plugin now — it's pure value equality
// over ResolvedCommand, framework-free — and arrives through this star.)
export * from '@embedpdf/plugin-commands';
import { useEffect } from 'react';
import { CommandsToken, resolvedCommandsEqual } from '@embedpdf/plugin-commands';
import type { CommandsCapability, ResolvedCommand } from '@embedpdf/plugin-commands';
// The keystroke matcher is a host fact.
import { CommandsToken as CommandsHostToken } from '@embedpdf/plugin-commands/contract/host';
import type { EventHook } from '@embedpdf/core';
import { useCapability, useCapabilityEvent, useDocumentId, useKernelValue } from './runtime';

/** The commands capability (registerCommand / execute / searchCommands / categories). */
export function useCommands(): CommandsCapability {
  return useCapability(CommandsToken);
}

/** Subscribe to one commands event for the mounted lifetime: `useCommandsEvent((c) => c.onExecuted, handler)`. */
export function useCommandsEvent<T>(
  select: (cap: CommandsCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(CommandsToken, select, handler);
}

/** A command resolved against this subtree's document, reactively. */
export function useCommand(id: string): ResolvedCommand | null {
  const commands = useCapability(CommandsToken);
  const documentId = useDocumentId();
  return useKernelValue(
    () => commands.resolveCommand(id, documentId ?? undefined),
    resolvedCommandsEqual,
  );
}

/** Is this environment mac-like? Decides how 'Mod' resolves and displays. */
export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const isEditableTarget = (target: EventTarget | null): boolean => {
  const el = target as HTMLElement | null;
  if (!el || !el.tagName) return false;
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
};

/**
 * Bind every registered shortcut. One listener for the whole registry —
 * matching is pure (ui-core), execution goes through the one command path.
 * Strokes from editable elements are ignored.
 */
export function useCommandShortcuts(options?: { isMac?: boolean }): void {
  const commands = useCapability(CommandsHostToken);
  const isMac = options?.isMac;
  useEffect(() => {
    const mac = isMac ?? isMacPlatform();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) return;
      const id = commands.matchStroke(event, { isMac: mac });
      if (!id) return;
      event.preventDefault();
      void commands.execute(id);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commands, isMac]);
}
