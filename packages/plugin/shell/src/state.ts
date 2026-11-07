/**
 * The panels page's State table as code: what `useShellState()` returns, and
 * the same fields in every other framework. With no document every surface
 * reads as closed and no menu as open.
 */
import { defineState } from '@embedpdf/core';

import { ShellToken, type SurfaceState } from './contract';

/** The open surfaces and the open menus. */
export interface ShellState {
  /** The open surfaces. */
  readonly openSurfaces: readonly SurfaceState[];
  /** The open menus, in the order they opened (the last one on top). */
  readonly openMenus: readonly string[];
}

export const shellState = defineState(ShellToken, {
  read: (shell): ShellState => ({
    openSurfaces: shell.listOpenSurfaces(),
    openMenus: shell.listOpenMenus(),
  }),
  empty: { openSurfaces: [], openMenus: [] },
});
