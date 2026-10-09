/**
 * @embedpdf/plugin-commands/contract/host — the host lens: the keystroke
 * matcher and the menu a command opens, for the toolbar's "More" menu. The
 * same runtime token as the public contract, typed wider.
 */
import { createHostToken } from '@embedpdf/core';
import type { KeyStroke } from '@embedpdf/core-ui';

import type { CommandId, CommandsCapability } from './contract';
import { CommandsToken as PublicCommandsToken } from './token';

export * from './contract';

export interface CommandsHostCapability extends CommandsCapability {
  /** The command whose shortcut a keystroke matches, or `null`. */
  matchStroke(stroke: KeyStroke, options: { isMac: boolean }): CommandId | null;
  /** The menu a command opens, for the "More" menu's nested menus; `null` for an unknown id. */
  getMenuTarget(id: CommandId): { menu?: string } | null;
}

export const CommandsToken = createHostToken<CommandsHostCapability>(PublicCommandsToken);
