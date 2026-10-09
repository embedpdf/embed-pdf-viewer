/**
 * The panels page's State table as code: what `useShellState()` returns, and
 * the same fields in every other framework. With no document every surface
 * reads as closed and no menu as open.
 */
import { defineState } from '@embedpdf/core';

import { ShellToken } from './contract';

export const shellState = defineState(ShellToken, {
  read: (shell) => ({
    openSurfaces: shell.listOpenSurfaces(),
    openMenus: shell.listOpenMenus(),
  }),
  empty: { openSurfaces: [], openMenus: [] },
});
