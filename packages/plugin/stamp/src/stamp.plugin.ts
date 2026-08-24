import { definePlugin } from '@embedpdf/core';
import { createStampCapability } from './capability';
import { initialStampState, stampReducer } from './reducer';
import { StampToken } from './types';
import type { StampAction, StampCapability, StampConfig, StampState } from './types';

/**
 * The stamp plugin. WORKSPACE-scoped: libraries are shared across every open
 * document; placement names its document explicitly (`armAsset(documentId, …)`)
 * and delegates to that document's annotation plugin — no hard `requires`,
 * because the annotation token is document-scoped and resolved lazily per
 * placement (a viewer without the annotation plugin fails at the arm call,
 * with the kernel's own missing-capability error).
 */
export const stampPlugin = (config: StampConfig = {}) =>
  definePlugin<StampState, StampAction, StampCapability>({
    id: 'stamp',
    token: StampToken,
    scope: 'workspace',
    initialState: initialStampState,
    reduce: stampReducer,
    capability: (ctx) => createStampCapability(ctx, config),
  });
