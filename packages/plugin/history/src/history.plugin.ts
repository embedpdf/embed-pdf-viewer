import { definePlugin } from '@embedpdf/core';

import { HISTORY_DEFAULTS, HistoryToken, type HistoryConfig } from './contract';
import { createHistoryController } from './controller';
import { emptyHistory } from './model';

/**
 * Undo and redo, one history per open document, of what this session changes through the
 * viewer's plugins: every change they stage on the document's change queue is a step. No
 * dependencies and no engine state of its own. `config` is the settings the app registers,
 * over {@link HISTORY_DEFAULTS}.
 */
export const historyPlugin = (config?: HistoryConfig) =>
  definePlugin({
    id: 'history',
    token: HistoryToken,
    scope: 'document',
    state: emptyHistory,
    settings: { defaults: HISTORY_DEFAULTS, registered: config },
    create: createHistoryController,
  });
