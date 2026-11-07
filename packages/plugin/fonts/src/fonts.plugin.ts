import { definePlugin } from '@embedpdf/core';

import { FontsToken } from './contract';
import { createFontsController } from './controller';

/** A document's fonts, and how a browser draws text in them. Takes no configuration. */
export const fontsPlugin = () =>
  definePlugin({
    id: 'fonts',
    token: FontsToken,
    scope: 'document',
    create: createFontsController,
  });
