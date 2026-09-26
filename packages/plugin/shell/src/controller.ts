/**
 * The shell controller — selectors (pure reads) + intents (dispatch), and the
 * one place the surface and menu events fire: every write goes through a
 * diffing dispatch, so an open or close can never be forgotten by a new verb.
 */
import { createEventHook, type PluginContext } from '@embedpdf/core';

import type { MenuEvent, ShellCapability, SurfaceEvent, SurfaceState } from './contract';
import type { ShellHostCapability } from './host-contract';
import type { ShellAction, ShellState } from './model';

export function createShellController(
  rawCtx: PluginContext<ShellState, ShellAction>,
): ShellHostCapability {
  const report = (error: unknown) => globalThis.console?.error('[shell] listener failed:', error);
  const surfaceOpened = createEventHook<SurfaceEvent>(report);
  const surfaceClosed = createEventHook<SurfaceEvent>(report);
  const menuOpened = createEventHook<MenuEvent>(report);
  const menuClosed = createEventHook<MenuEvent>(report);
  rawCtx.cleanup(() => {
    for (const hook of [surfaceOpened, surfaceClosed, menuOpened, menuClosed]) hook.dispose();
  });

  const emitDiffs = (before: ShellState, after: ShellState): void => {
    if (before === after) return;
    if (before.surfaces !== after.surfaces) {
      const ids = new Set([...Object.keys(before.surfaces), ...Object.keys(after.surfaces)]);
      for (const id of ids) {
        const was = before.surfaces[id]?.open ?? false;
        const now = after.surfaces[id]?.open ?? false;
        if (was === now) continue;
        (now ? surfaceOpened : surfaceClosed).emit({ id, props: after.surfaces[id]?.props });
      }
    }
    if (before.openMenus !== after.openMenus) {
      for (const id of before.openMenus) if (!after.openMenus.includes(id)) menuClosed.emit({ id });
      for (const id of after.openMenus) if (!before.openMenus.includes(id)) menuOpened.emit({ id });
    }
  };
  const ctx: PluginContext<ShellState, ShellAction> = {
    ...rawCtx,
    dispatch: (action) => {
      const before = rawCtx.getState();
      rawCtx.dispatch(action);
      emitDiffs(before, rawCtx.getState());
    },
  };
  const state = () => ctx.getState();

  /** Surface records with their id, memoized per record so reads stay reference-stable. */
  const records = new WeakMap<object, SurfaceState>();
  const surfaceOf = (id: string): SurfaceState | null => {
    const record = state().surfaces[id];
    if (!record) return null;
    let view = records.get(record);
    if (!view) {
      view = { id, ...record };
      records.set(record, view);
    }
    return view;
  };
  let openFor: ShellState['surfaces'] | null = null;
  let openList: readonly SurfaceState[] = [];
  const listOpenSurfaces = (): readonly SurfaceState[] => {
    const { surfaces } = state();
    if (openFor === surfaces) return openList;
    openFor = surfaces;
    openList = Object.keys(surfaces)
      .filter((id) => surfaces[id].open)
      .map((id) => surfaceOf(id)!);
    return openList;
  };

  return {
    isOpen: (id) => state().surfaces[id]?.open ?? false,
    getSurface: surfaceOf,
    listOpenSurfaces,
    open: (id, options) =>
      ctx.dispatch({
        type: 'SHELL/OPEN_SURFACE',
        id,
        exclusive: options?.exclusive,
        props: options?.props,
      }),
    close: (id) => ctx.dispatch({ type: 'SHELL/CLOSE_SURFACE', id }),
    toggle: (id, options) =>
      ctx.dispatch({
        type: 'SHELL/TOGGLE_SURFACE',
        id,
        exclusive: options?.exclusive,
        props: options?.props,
      }),
    updateSurfaceProps: (id, props) => ctx.dispatch({ type: 'SHELL/SET_SURFACE_PROPS', id, props }),
    closeAll: () => ctx.dispatch({ type: 'SHELL/CLOSE_ALL_SURFACES' }),
    isMenuOpen: (id) => state().openMenus.includes(id),
    listOpenMenus: () => state().openMenus,
    openMenu: (id) => ctx.dispatch({ type: 'SHELL/OPEN_MENU', id }),
    closeMenu: (id) => ctx.dispatch({ type: 'SHELL/CLOSE_MENU', id }),
    toggleMenu: (id) =>
      ctx.dispatch(
        state().openMenus.includes(id)
          ? { type: 'SHELL/CLOSE_MENU', id }
          : { type: 'SHELL/OPEN_MENU', id },
      ),
    closeAllMenus: () => ctx.dispatch({ type: 'SHELL/CLOSE_ALL_MENUS' }),
    getSnapshot: () => state(),
    applySnapshot: (snapshot) => ctx.dispatch({ type: 'SHELL/APPLY_SNAPSHOT', snapshot }),
    onSurfaceOpened: surfaceOpened.on,
    onSurfaceClosed: surfaceClosed.on,
    onMenuOpened: menuOpened.on,
    onMenuClosed: menuClosed.on,
  } satisfies ShellCapability;
}
