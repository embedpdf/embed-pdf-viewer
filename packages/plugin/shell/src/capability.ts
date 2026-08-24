import type { PluginContext } from '@embedpdf/core';
import type { OpenSurfaceOptions, ShellAction, ShellCapability, ShellState } from './types';

/** Selectors (pure reads) + intents (dispatch). No DOM, no engine. */
export function createShellCapability(
  ctx: PluginContext<ShellState, ShellAction>,
): ShellCapability {
  return {
    // ── selectors ──
    isOpen: (id) => ctx.getState().surfaces[id]?.open ?? false,
    surfaceProps: (id) => ctx.getState().surfaces[id]?.props,
    openSurfaces: () =>
      Object.entries(ctx.getState().surfaces)
        .filter(([, s]) => s.open)
        .map(([id]) => id),
    openMenus: () => ctx.getState().openMenus,
    isMenuOpen: (id) => ctx.getState().openMenus.includes(id),

    // ── intents ──
    open: (id, opts?: OpenSurfaceOptions) =>
      ctx.dispatch({
        type: 'SHELL/OPEN_SURFACE',
        id,
        exclusive: opts?.exclusive,
        props: opts?.props,
      }),
    close: (id) => ctx.dispatch({ type: 'SHELL/CLOSE_SURFACE', id }),
    toggle: (id, opts?: OpenSurfaceOptions) =>
      ctx.dispatch({
        type: 'SHELL/TOGGLE_SURFACE',
        id,
        exclusive: opts?.exclusive,
        props: opts?.props,
      }),
    openMenu: (id) => ctx.dispatch({ type: 'SHELL/OPEN_MENU', id }),
    closeMenu: (id) => ctx.dispatch({ type: 'SHELL/CLOSE_MENU', id }),
    toggleMenu: (id) =>
      ctx.dispatch(
        ctx.getState().openMenus.includes(id)
          ? { type: 'SHELL/CLOSE_MENU', id }
          : { type: 'SHELL/OPEN_MENU', id },
      ),
    closeAllMenus: () => ctx.dispatch({ type: 'SHELL/CLOSE_ALL_MENUS' }),
  };
}
