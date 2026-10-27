import { definePlugin } from '@embedpdf/core';
import { ActionsToken } from '@embedpdf/plugin-actions/contract';
import { I18nToken } from '@embedpdf/plugin-i18n/contract';
import { LinkToken } from '@embedpdf/plugin-link/contract';
import { SelectionToken } from '@embedpdf/plugin-selection/contract';
import { StageToken } from '@embedpdf/plugin-stage/contract';

import { OutlineToken } from './contract';
import { createOutlineController } from './controller';
import { initialOutlineModel } from './model';

/**
 * The document's outline (its bookmarks). Document-scoped; optionally uses
 * the stage (where items go, the reading position), actions (an item's `/A`),
 * link (websites), selection (a new item's title) and i18n (its default title).
 */
export const outlinePlugin = () =>
  definePlugin({
    id: 'outline',
    token: OutlineToken,
    scope: 'document',
    optional: [StageToken, ActionsToken, LinkToken, SelectionToken, I18nToken],
    state: initialOutlineModel,
    create: createOutlineController,
  });
