/**
 * Keyboard shortcuts for commands: one `keydown` listener runs the command a
 * key matches. Matching is the commands plugin's; what this module adds is the
 * browser's part: the platform, whether a key was typed into a text field, and
 * the default action a shortcut replaces. Structurally typed, so it needs no EmbedPDF
 * package (the commands host capability satisfies {@link ShortcutCommands}).
 */
import { isFromTextField } from './text-field-event';

/** Why a matched command won't run whatever the moment, as the commands plugin says it. */
export interface ShortcutRefusal {
  /** Turned off in this viewer, or not allowed by the scope. */
  readonly reason: 'turned-off' | 'not-allowed';
  /** A sentence for the user. */
  readonly message: string;
}

/** The part of the commands capability shortcuts need. */
export interface ShortcutCommands {
  /**
   * The command a keystroke's shortcut names, with its refusal when it's refused, or `null`.
   * With `inTextField`, only a command that runs from text fields.
   */
  matchStroke(
    stroke: KeyboardEvent,
    options: { isMac: boolean; inTextField: boolean },
  ): { readonly commandId: string; readonly refusal: ShortcutRefusal | null } | null;
  canExecute(id: string): boolean;
  execute(id: string): Promise<unknown>;
}

export interface CommandShortcutOptions {
  /** Whether `Mod` is Cmd (a Mac) or Ctrl. Default: what the browser says. */
  isMac?: boolean;
  /** Where to listen. Default: `window`. */
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
  /** Called when a key's command is turned off or not allowed, with why: say so to the user. */
  onRefused?: (commandId: string, refusal: ShortcutRefusal) => void;
}

/** Whether this is an Apple platform, where `Mod` is Cmd and shortcuts show as `⌘K`. */
export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

/**
 * Run a command when its shortcut is pressed, and return the function that stops listening.
 * Keys typed into a text field are left alone, except a command's that says it runs from text
 * fields (`shortcutInTextFields`, as Find does). A command that's turned off or not allowed
 * still takes its key, so the browser doesn't do something else with it (Cmd+P printing the
 * page), and `onRefused` says why. A key whose command only can't run right now keeps its
 * browser default.
 */
export function bindCommandShortcuts(
  commands: ShortcutCommands,
  options: CommandShortcutOptions = {},
): () => void {
  const isMac = options.isMac ?? isMacPlatform();
  const target = options.target ?? window;
  const onKeyDown = (event: Event) => {
    const stroke = event as KeyboardEvent;
    if (stroke.defaultPrevented) return;
    const match = commands.matchStroke(stroke, { isMac, inTextField: isFromTextField(stroke) });
    if (!match) return;
    if (match.refusal) {
      stroke.preventDefault();
      options.onRefused?.(match.commandId, match.refusal);
      return;
    }
    if (!commands.canExecute(match.commandId)) return;
    stroke.preventDefault();
    // A failing command reports itself through the capability's onExecutionFailed.
    commands.execute(match.commandId).catch(() => {});
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
