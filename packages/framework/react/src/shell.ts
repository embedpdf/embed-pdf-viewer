/**
 * The React surface for @embedpdf/plugin-shell. The app owns every
 * surface's DOM; these hooks bind its open/closed state to the kernel so
 * commands can drive it and persist can restore it.
 *
 * These hooks are TOTAL: shell state is document-scoped, and chrome that uses
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
import { useCapability, useOptionalCapability, useOptionalSelector } from './runtime';

/** The raw capability — throws without a document; for gated subtrees. */
export function useShell(): ShellCapability {
  return useCapability(ShellToken);
}

export interface SurfaceHandle {
  readonly isOpen: boolean;
  readonly props: Readonly<Record<string, unknown>> | undefined;
  open(opts?: OpenSurfaceOptions): void;
  close(): void;
  toggle(opts?: OpenSurfaceOptions): void;
}

/** One named surface (panel / modal / overlay), bound to this subtree's
 *  document. Reads as closed — and intents no-op — while no document is open. */
export function useSurface(id: string): SurfaceHandle {
  const shell = useOptionalCapability(ShellToken);
  const isOpen = useOptionalSelector(ShellToken, (s) => s.isOpen(id), false);
  const props = useOptionalSelector(ShellToken, (s) => s.surfaceProps(id), undefined);
  return useMemo(
    () => ({
      isOpen,
      props,
      open: (opts?: OpenSurfaceOptions) => shell?.open(id, opts),
      close: () => shell?.close(id),
      toggle: (opts?: OpenSurfaceOptions) => shell?.toggle(id, opts),
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
const stringArrayEqual = (a: readonly string[], b: readonly string[]) =>
  a === b || (a.length === b.length && a.every((x, i) => x === b[i]));

/** The dropdown-menu stack for this subtree's document (empty without one). */
export function useMenus(): MenusHandle {
  const shell = useOptionalCapability(ShellToken);
  const open = useOptionalSelector(ShellToken, (s) => s.openMenus(), NO_MENUS, stringArrayEqual);
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
