/**
 * The shell controller: reads, verbs that apply the pure transitions in
 * `model.ts`, and the surface and menu events. The events are derived in one
 * place, from each state change, so a new verb can never forget to announce.
 */
import { memo, memoByKey, type PluginContext } from '@embedpdf/core';

import type { MenuEvent, ShellCapability, SurfaceEvent, SurfaceState } from './contract';
import {
  applySnapshot,
  closeAllMenus,
  closeAllSurfaces,
  closeMenu,
  closeSurface,
  openMenu,
  openSurface,
  setSurfaceProps,
  toggleMenu,
  toggleSurface,
  type ShellState,
} from './model';

export function createShellController(ctx: PluginContext<ShellState>) {
  const surfaceOpened = ctx.events.source<SurfaceEvent>();
  const surfaceClosed = ctx.events.source<SurfaceEvent>();
  const menuOpened = ctx.events.source<MenuEvent>();
  const menuClosed = ctx.events.source<MenuEvent>();

  ctx.state.onChange(({ previous, next }) => {
    if (previous.surfaces !== next.surfaces) {
      const ids = new Set([...Object.keys(previous.surfaces), ...Object.keys(next.surfaces)]);
      for (const id of ids) {
        const wasOpen = previous.surfaces[id]?.open ?? false;
        const isOpen = next.surfaces[id]?.open ?? false;
        if (wasOpen === isOpen) continue;
        (isOpen ? surfaceOpened : surfaceClosed).emit({ id, props: next.surfaces[id]?.props });
      }
    }
    if (previous.openMenus !== next.openMenus) {
      for (const id of previous.openMenus) {
        if (!next.openMenus.includes(id)) menuClosed.emit({ id });
      }
      for (const id of next.openMenus) {
        if (!previous.openMenus.includes(id)) menuOpened.emit({ id });
      }
    }
  });

  const state = () => ctx.state.get();

  /** A surface's public shape, the same object until its record changes. */
  const surfaceOf = memoByKey(
    (id: string) => [state().surfaces[id]],
    (id, surface): SurfaceState | null => (surface ? { id, ...surface } : null),
  );
  const listOpenSurfaces = memo(
    () => [state().surfaces],
    (surfaces) =>
      Object.keys(surfaces)
        .filter((id) => surfaces[id].open)
        .map((id) => surfaceOf(id)!),
  );

  const api: ShellCapability = {
    isOpen: (id) => state().surfaces[id]?.open ?? false,
    getSurface: surfaceOf,
    listOpenSurfaces,
    open: (id, options) => ctx.state.update(openSurface, id, options),
    close: (id) => ctx.state.update(closeSurface, id),
    toggle: (id, options) => ctx.state.update(toggleSurface, id, options),
    updateSurfaceProps: (id, props) => ctx.state.update(setSurfaceProps, id, props),
    closeAll: () => ctx.state.update(closeAllSurfaces),
    isMenuOpen: (id) => state().openMenus.includes(id),
    listOpenMenus: () => state().openMenus,
    openMenu: (id) => ctx.state.update(openMenu, id),
    closeMenu: (id) => ctx.state.update(closeMenu, id),
    toggleMenu: (id) => ctx.state.update(toggleMenu, id),
    closeAllMenus: () => ctx.state.update(closeAllMenus),
    getSnapshot: () => state(),
    applySnapshot: (snapshot) => ctx.state.update(applySnapshot, snapshot),
    onSurfaceOpened: surfaceOpened.on,
    onSurfaceClosed: surfaceClosed.on,
    onMenuOpened: menuOpened.on,
    onMenuClosed: menuClosed.on,
  };
  return { api };
}
