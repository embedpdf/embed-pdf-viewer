import { createHostToken, definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';

import { DEFAULT_LENS_ID } from './connect';
import type { StagePluginOptions } from './contract';
import { createStageController } from './controller';
import type { StageHostCapability } from './host-contract';
import { initialStageState, type StageState } from './model';
import { StageToken } from './token';

/**
 * The stage plugin: one lens's camera, layout, zoom and navigation over a
 * document. Document-scoped. The actions plugin is optional: with it, the
 * main lens feeds page state to it and interprets GoTo and Named page
 * actions. Pointer input is opted into by the surface binding
 * (`<Stage interaction>` / `createStageSurface`), which both forwards pointer
 * samples and registers this lens's scroll handler.
 */
export const stagePlugin = (options: StagePluginOptions = {}) => {
  const { id = DEFAULT_LENS_ID, token = StageToken, ...config } = options;
  return definePlugin<StageState, StageHostCapability>({
    id,
    token: createHostToken<StageHostCapability>(token),
    scope: 'document',
    optional: [ActionsToken],
    state: () => initialStageState(config),
    create: (ctx) => createStageController(ctx, config),
  });
};
