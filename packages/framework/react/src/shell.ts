/**
 * The React surface for @embedpdf/plugin-shell. The app owns every
 * surface's DOM; these hooks bind its open/closed state to the kernel so
 * commands can drive it and applications can restore it.
 *
 * The state hooks work without a document: shell state is document-scoped,
 * and chrome that uses it (panel buttons, menu anchors) stays mounted across
 * the empty workspace. With no document every surface reads as closed, no menu
 * as open, and `useSurface`'s verbs do nothing. `useShell()` then returns the
 * stand-in, whose methods throw `not-ready`.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-shell';
import { useMemo } from 'react';
import { ShellToken, shellState } from '@embedpdf/plugin-shell';
import type { OpenSurfaceOptions, ShellCapability, SurfaceProps } from '@embedpdf/plugin-shell';
import type { EventHook } from '@embedpdf/core';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
} from './runtime';
import { stateHook } from './state';

/** The shell capability: open and close panels, dialogs and menus. Without a document its methods throw `not-ready`. */
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

/**
 * Which panels, dialogs and menus are open (the page's State table, declared
 * once in `shellState`). Takes a selector, and re-renders only when what it
 * returns changes. Without a document nothing is open.
 */
export const useShellState = stateHook(shellState);

export interface SurfaceHandle {
  readonly isOpen: boolean;
  /** The props the surface was opened with, or updated to; empty when it has none. */
  readonly props: SurfaceProps;
  open(options?: OpenSurfaceOptions): void;
  close(): void;
  toggle(options?: OpenSurfaceOptions): void;
}

const NO_PROPS: SurfaceProps = Object.freeze({});

/** One named surface (panel, dialog, overlay) of this subtree's document. Reads as closed, and its verbs do nothing, while no document is open. */
export function useSurface(id: string): SurfaceHandle {
  const shell = useOptionalCapability(ShellToken);
  const isOpen = useOptionalSelector(ShellToken, (shell) => shell.isOpen(id), false);
  const props = useOptionalSelector(
    ShellToken,
    (shell) => shell.getSurface(id)?.props ?? NO_PROPS,
    NO_PROPS,
  );
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
