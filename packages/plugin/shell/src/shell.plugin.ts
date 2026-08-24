import { definePlugin } from '@embedpdf/core';
import { createShellCapability } from './capability';
import { initialShellState, shellReducer } from './reducer';
import { ShellToken } from './types';
import type { ShellAction, ShellCapability, ShellState } from './types';

/**
 * The shell plugin: document-scoped (each document keeps its own panels, so
 * switching tabs restores them). Pure state, no effects — the app renders
 * surfaces; commands toggle them.
 */
export const shellPlugin = () =>
  definePlugin<ShellState, ShellAction, ShellCapability>({
    id: 'shell',
    scope: 'document',
    token: ShellToken,
    initialState: initialShellState,
    reduce: shellReducer,
    capability: createShellCapability,
  });
