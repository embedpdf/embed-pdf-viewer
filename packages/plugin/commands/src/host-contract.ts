/** @embedpdf/plugin-commands/contract/host — the HOST lens: the keystroke
 *  matcher and the overflow projection's menu target. Same runtime token, typed wider. */
import type { CapabilityToken } from '@embedpdf/core';
import type { KeyStroke } from '@embedpdf/core-ui';

import type { CommandId, CommandsCapability } from './contract';
import { CommandsToken as PublicCommandsToken } from './token';

export * from './contract';
export type { CommandsAction, CommandsState } from './model';

export interface CommandsHostCapability extends CommandsCapability {
  /** Match a keystroke against every registered shortcut → command id or null. */
  matchStroke(stroke: KeyStroke, options: { isMac: boolean }): CommandId | null;
  /** The one fact the overflow projection needs (ResolveMenuTarget-shaped). */
  getMenuTarget(id: CommandId): { menu?: string } | null;
}

export const CommandsToken =
  PublicCommandsToken as unknown as CapabilityToken<CommandsHostCapability>;
