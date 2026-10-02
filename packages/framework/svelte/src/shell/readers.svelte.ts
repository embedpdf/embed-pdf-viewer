/**
 * The shell plugin's readers. The app owns every surface's DOM; these bind its open and closed
 * state to the kernel, so commands can drive it and an app can restore it.
 *
 * They work without a document: shell state is a document's, and chrome that uses it (panel
 * buttons, menu anchors) stays mounted while none is open. With no document every surface reads
 * as closed, no menu as open, and `useSurface`'s verbs do nothing; `useShell()` then reaches the
 * stand-in, whose calls refuse with `not-ready`.
 */
import type { EventHook } from '@embedpdf/core';
import { ShellToken, shellState } from '@embedpdf/plugin-shell';
import type { OpenSurfaceOptions, ShellCapability, SurfaceProps } from '@embedpdf/plugin-shell';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import { stateReader } from '../runtime/state.svelte';
import { valueOf, type MaybeGetter } from '../runtime/values.svelte';

/** The shell API: open and close panels, dialogs and menus. Without a document its calls refuse with `not-ready`. */
export function useShell(): ShellCapability {
  return useCapability(ShellToken);
}

/** Subscribe to one shell event while the component lives: `useShellEvent((shell) => shell.onSurfaceOpened, handler)`. */
export function useShellEvent<T>(
  select: (shell: ShellCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(ShellToken, select, handler);
}

/**
 * Which panels, dialogs and menus are open (declared once in `shellState`), as a reactive object
 * (`useShellState().openMenus`). Takes a selector. Without a document nothing is open.
 */
export const useShellState = stateReader(shellState);

/** One surface: whether it's open and its props, read live, and the calls that change it. */
export interface SurfaceHandle {
  readonly isOpen: boolean;
  /** The props the surface was opened with, or updated to; empty when it has none. */
  readonly props: SurfaceProps;
  open(options?: OpenSurfaceOptions): void;
  close(): void;
  toggle(options?: OpenSurfaceOptions): void;
}

const NO_PROPS: SurfaceProps = Object.freeze({});

/**
 * One named surface (panel, dialog, overlay) of this component's document: `panel.isOpen` and
 * `panel.props` update in a template, and `open`, `close` and `toggle` can be passed as handlers
 * (`onclick={panel.close}`). Pass the id as a function to follow a prop. It reads as closed, and
 * its calls do nothing, while no document is open.
 */
export function useSurface(id: MaybeGetter<string>): SurfaceHandle {
  const shell = useOptionalCapability(ShellToken);
  const isOpen = useOptionalSelector(ShellToken, (shell) => shell.isOpen(valueOf(id)), false);
  const props = useOptionalSelector(
    ShellToken,
    (shell) => shell.getSurface(valueOf(id))?.props ?? NO_PROPS,
    NO_PROPS,
  );
  return {
    get isOpen() {
      return isOpen.current;
    },
    get props() {
      return props.current;
    },
    open: (options) => shell.current?.open(valueOf(id), options),
    close: () => shell.current?.close(valueOf(id)),
    toggle: (options) => shell.current?.toggle(valueOf(id), options),
  };
}
