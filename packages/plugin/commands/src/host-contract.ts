/**
 * @embedpdf/plugin-commands/contract/host — the host lens: the keystroke
 * matcher and the menu a command opens, for the toolbar's "More" menu. The
 * same runtime token as the public contract, typed wider.
 */
import { createHostToken } from '@embedpdf/core';
import type { KeyStroke } from '@embedpdf/core-ui';

import type { CommandId, CommandRefusal, CommandsCapability } from './contract';
import { CommandsToken as PublicCommandsToken } from './token';

export * from './contract';

/** The command a keystroke's shortcut names, and why it won't run when it's refused. */
export interface ShortcutMatch {
  readonly commandId: CommandId;
  /** Set when the command is turned off or not allowed; `null` when it may run (or just can't right now). */
  readonly refusal: CommandRefusal | null;
}

export interface CommandsHostCapability extends CommandsCapability {
  /**
   * The command whose shortcut a keystroke matches, for the active document, or `null`. Of
   * several with the same keys, one that isn't refused wins; a refused one counts only while
   * its `visible` says it would show. With `inTextField` (the key was typed in one), only a
   * command whose `shortcutInTextFields` says so matches.
   */
  matchStroke(
    stroke: KeyStroke,
    options: { isMac: boolean; inTextField?: boolean },
  ): ShortcutMatch | null;
  /** The menu a command opens, for the "More" menu's nested menus; `null` for an unknown id. */
  getMenuTarget(id: CommandId): { menu?: string } | null;
}

export const CommandsToken = createHostToken<CommandsHostCapability>(PublicCommandsToken);
