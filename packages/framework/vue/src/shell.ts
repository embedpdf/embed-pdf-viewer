/**
 * @embedpdf/vue/shell: the Vue surface of `@embedpdf/plugin-shell`. The app
 * owns every surface's DOM; these composables bind its open/closed state to the
 * kernel, so commands can drive it and an app can save and restore it.
 *
 * They work without a document: shell state is per document, and chrome that
 * uses it (panel buttons, menu anchors) stays mounted across the empty
 * workspace. With no document every surface reads as closed, no menu as open,
 * and `useSurface`'s verbs do nothing; `useShell()` is then the stand-in, whose
 * methods throw `not-ready`.
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-shell';
import { toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import { ShellToken, shellState } from '@embedpdf/plugin-shell';
import type { OpenSurfaceOptions, ShellCapability, SurfaceProps } from '@embedpdf/plugin-shell';
import type { EventHook } from '@embedpdf/core';
import {
  useCapability,
  useCapabilityEvent,
  useOptionalCapability,
  useOptionalSelector,
} from './runtime/capabilities';
import { stateComposable } from './state';

/** The shell API: open and close panels, dialogs and menus. Without a document its methods throw `not-ready`. */
export function useShell(): ShellCapability {
  return useCapability(ShellToken);
}

/** Subscribe to one shell event while the component lives: `useShellEvent((shell) => shell.onSurfaceOpened, handler)`. */
export function useShellEvent<Event>(
  select: (shell: ShellCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(ShellToken, select, handler);
}

/**
 * Which panels, dialogs and menus are open, as refs (the page's State table,
 * declared once in `shellState`). With a selector, one ref, which updates only
 * when what it picks changes. Without a document nothing is open.
 */
export const useShellState = stateComposable(shellState);

/** One surface, as {@link useSurface} gives it: its state as refs, and the verbs. */
export interface SurfaceHandle {
  /** Whether the surface is open. */
  readonly isOpen: Readonly<Ref<boolean>>;
  /** The props the surface was opened with, or updated to; empty when it has none. */
  readonly props: Readonly<Ref<SurfaceProps>>;
  open(options?: OpenSurfaceOptions): void;
  close(): void;
  toggle(options?: OpenSurfaceOptions): void;
}

const NO_PROPS: SurfaceProps = Object.freeze({});

/**
 * One named surface (a panel, a dialog, an overlay) of this subtree's
 * document: `const { isOpen, toggle } = useSurface('comments')`. Its state is
 * refs, so destructuring keeps them reactive; pass a getter for an id that
 * changes. Reads as closed, and its verbs do nothing, while no document is open.
 */
export function useSurface(id: MaybeRefOrGetter<string>): SurfaceHandle {
  const shell = useOptionalCapability(ShellToken);
  const isOpen = useOptionalSelector(ShellToken, (current) => current.isOpen(toValue(id)), false);
  const props = useOptionalSelector(
    ShellToken,
    (current) => current.getSurface(toValue(id))?.props ?? NO_PROPS,
    NO_PROPS,
  );
  return Object.freeze({
    isOpen,
    props,
    open: (options?: OpenSurfaceOptions) => shell.value?.open(toValue(id), options),
    close: () => shell.value?.close(toValue(id)),
    toggle: (options?: OpenSurfaceOptions) => shell.value?.toggle(toValue(id), options),
  });
}
