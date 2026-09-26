/**
 * The React surface for @embedpdf/plugin-shell. The app owns every
 * surface's DOM; these hooks bind its open/closed state to the kernel so
 * commands can drive it and applications can restore it.
 *
 * These hooks are total: shell state is document-scoped, and chrome that uses
 * it (panel buttons, mode bands, menu anchors) stays mounted across the
 * empty-workspace state. With no document, surfaces read as closed, menus as
 * none, and intents no-op — mirroring how command execution `tryGet`s the
 * shell. Use the raw capability (`useShell`) when you need fail-fast access
 * inside a <DocumentGate>.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-shell';
import { useMemo } from 'react';
import { ShellToken } from '@embedpdf/plugin-shell';
import type { OpenSurfaceOptions, ShellCapability } from '@embedpdf/plugin-shell';
import type { EventHook } from '@embedpdf/core';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
} from './runtime';

/** The raw capability — throws without a document; for gated subtrees. */
export function useShell(): ShellCapability {
  return useCapability(ShellToken);
}

/** Subscribe to one shell event for the mounted lifetime: `useShellEvent((shell) => shell.onSurfaceOpened, handler)`. */
export function useShellEvent<T>(
  select: (shell: ShellCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ShellToken, select, handler);
}

export interface SurfaceHandle {
  readonly isOpen: boolean;
  readonly props: Readonly<Record<string, unknown>> | undefined;
  open(options?: OpenSurfaceOptions): void;
  close(): void;
  toggle(options?: OpenSurfaceOptions): void;
}

/** One named surface (panel / modal / overlay), bound to this subtree's
 *  document. Reads as closed — and intents no-op — while no document is open. */
export function useSurface(id: string): SurfaceHandle {
  const shell = useOptionalCapability(ShellToken);
  const isOpen = useOptionalSelector(ShellToken, (shell) => shell.isOpen(id), false);
  const props = useOptionalSelector(ShellToken, (shell) => shell.getSurface(id)?.props, undefined);
  return useMemo(
    () => ({
      isOpen,
      props,
      open: (options?: OpenSurfaceOptions) => shell?.open(id, options),
      close: () => shell?.close(id),
      toggle: (options?: OpenSurfaceOptions) => shell?.toggle(id, options),
    }),
    [shell, id, isOpen, props],
  );
}

export interface MenusHandle {
  readonly open: readonly string[];
  isOpen(id: string): boolean;
  toggle(id: string): void;
  close(id: string): void;
  closeAll(): void;
}

const NO_MENUS: readonly string[] = [];
const stringArrayEqual = (left: readonly string[], right: readonly string[]) =>
  left === right || (left.length === right.length && left.every((item, i) => item === right[i]));

/** The dropdown-menu stack for this subtree's document (empty without one). */
export function useMenus(): MenusHandle {
  const shell = useOptionalCapability(ShellToken);
  const open = useOptionalSelector(
    ShellToken,
    (shell) => shell.listOpenMenus(),
    NO_MENUS,
    stringArrayEqual,
  );
  return useMemo(
    () => ({
      open,
      isOpen: (id: string) => open.includes(id),
      toggle: (id: string) => shell?.toggleMenu(id),
      close: (id: string) => shell?.closeMenu(id),
      closeAll: () => shell?.closeAllMenus(),
    }),
    [shell, open],
  );
}
