import { definePlugin } from '@embedpdf/core';

import { ShellToken } from './contract';
import { createShellController } from './controller';
import { initialShellState } from './model';

/**
 * The shell plugin: which surfaces (panels, modals, overlays) and menus are
 * open. Document-scoped, so each document keeps its own panels and switching
 * tabs restores them. The app renders the surfaces; the shell only stores
 * their state.
 */
export const shellPlugin = () =>
  definePlugin({
    id: 'shell',
    scope: 'document',
    token: ShellToken,
    state: initialShellState,
    create: createShellController,
  });
