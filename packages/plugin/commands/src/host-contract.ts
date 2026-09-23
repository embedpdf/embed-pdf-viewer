/**
 * @embedpdf/plugin-commands/contract/host — the host lens: the keystroke
 * matcher and the overflow projection's menu target. The same runtime token
 * as the public contract, typed wider.
 */
import { createHostToken } from '@embedpdf/core';
import type { KeyStroke } from '@embedpdf/core-ui';

import type { CommandId, CommandsCapability } from './contract';
import { CommandsToken as PublicCommandsToken } from './token';

export * from './contract';
export type { CommandsState } from './model';

export interface CommandsHostCapability extends CommandsCapability {
  /** Match a keystroke against every registered shortcut; the matching command id, or null. */
  matchStroke(stroke: KeyStroke, options: { isMac: boolean }): CommandId | null;
  /** The one fact the overflow projection needs (ResolveMenuTarget-shaped). */
  getMenuTarget(id: CommandId): { menu?: string } | null;
}

export const CommandsToken = createHostToken<CommandsHostCapability>(PublicCommandsToken);
