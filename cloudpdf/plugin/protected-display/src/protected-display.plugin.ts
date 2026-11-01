import { definePlugin } from '@embedpdf/core';
import { RenderToken } from '@embedpdf/plugin-render/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract/host';

import {
  PROTECTED_DISPLAY_DEFAULTS,
  ProtectedDisplayToken,
  type ProtectedDisplayConfig,
} from './contract';
import { createProtectedDisplayController } from './controller';
import { initialProtectedDisplayModel } from './model';

/**
 * Screenshot protection: for a user who may see the pages as protected video
 * (`protected-display.view`) and not render them (no `doc.render`), on the cloud engine, the
 * pages show as DRM-protected video frames from the protected display server module, played by
 * the `player` the app gives. It does nothing for anyone else. `config` is the settings the app
 * registers, over {@link PROTECTED_DISPLAY_DEFAULTS}.
 */
export const protectedDisplayPlugin = (config?: ProtectedDisplayConfig) =>
  definePlugin({
    id: 'protected-display',
    token: ProtectedDisplayToken,
    scope: 'document',
    requires: [RenderToken, StageToken],
    state: initialProtectedDisplayModel,
    settings: { defaults: PROTECTED_DISPLAY_DEFAULTS, registered: config, whole: ['player'] },
    create: createProtectedDisplayController,
  });
