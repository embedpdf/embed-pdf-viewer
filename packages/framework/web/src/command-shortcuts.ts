/**
 * Keyboard shortcuts for commands: one `keydown` listener runs the command a
 * key matches. Matching is the commands plugin's; what this module adds is the
 * browser's part: the platform, keys typed into text fields, and the default
 * action a shortcut replaces. Structurally typed, so it needs no EmbedPDF
 * package (the commands host capability satisfies {@link ShortcutCommands}).
 */

/** The part of the commands capability shortcuts need. */
export interface ShortcutCommands {
  /** The command a keystroke's shortcut names, or `null`. */
  matchStroke(stroke: KeyboardEvent, options: { isMac: boolean }): string | null;
  canExecute(id: string): boolean;
  execute(id: string): Promise<unknown>;
}

export interface CommandShortcutOptions {
  /** Whether `Mod` is Cmd (a Mac) or Ctrl. Default: what the browser says. */
  isMac?: boolean;
  /** Where to listen. Default: `window`. */
  target?: Pick<Window, 'addEventListener' | 'removeEventListener'>;
}

/** Whether this is an Apple platform, where `Mod` is Cmd and shortcuts show as `⌘K`. */
export const isMacPlatform = (): boolean =>
  typeof navigator !== 'undefined' && /Mac|iP(hone|ad|od)/.test(navigator.platform);

const isEditable = (target: EventTarget | null): boolean => {
  const element = target as HTMLElement | null;
  if (!element || !element.tagName) return false;
  return (
    element.tagName === 'INPUT' ||
    element.tagName === 'TEXTAREA' ||
    element.tagName === 'SELECT' ||
    element.isContentEditable
  );
};

/**
 * Run a command when its shortcut is pressed, and return the function that stops listening.
 * Keys typed into a text field are left alone, and so is a key whose command can't run now:
 * its browser default (Cmd+C copying the page, say) still happens.
 */
export function bindCommandShortcuts(
  commands: ShortcutCommands,
  options: CommandShortcutOptions = {},
): () => void {
  const isMac = options.isMac ?? isMacPlatform();
  const target = options.target ?? window;
  const onKeyDown = (event: Event) => {
    const stroke = event as KeyboardEvent;
    if (stroke.defaultPrevented || isEditable(stroke.target)) return;
    const id = commands.matchStroke(stroke, { isMac });
    if (!id || !commands.canExecute(id)) return;
    stroke.preventDefault();
    // A failing command reports itself through the capability's onExecutionFailed.
    commands.execute(id).catch(() => {});
  };
  target.addEventListener('keydown', onKeyDown);
  return () => target.removeEventListener('keydown', onKeyDown);
}
