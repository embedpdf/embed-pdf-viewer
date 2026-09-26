import { definePlugin } from '@embedpdf/core';

import { createShellController } from './controller';
import { ShellToken } from './host-contract';
import type { ShellHostCapability } from './host-contract';
import { initialShellState, shellReducer } from './model';
import type { ShellAction, ShellState } from './model';

/**
 * The shell plugin: document-scoped (each document keeps its own panels, so
 * switching tabs restores them). Pure state, no effects — the app renders
 * surfaces; commands toggle them.
 */
export const shellPlugin = () =>
  definePlugin<ShellState, ShellAction, ShellHostCapability>({
    id: 'shell',
    scope: 'document',
    token: ShellToken,
    initialState: initialShellState,
    reduce: shellReducer,
    create: (ctx) => ({ api: createShellController(ctx) }),
  });
