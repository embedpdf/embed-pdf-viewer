import { CommandsCapability } from '../../lib/types';

/**
 * Build a shortcut string from a keyboard event
 * @example Ctrl+Shift+A -> "ctrl+shift+a"
 */
export function buildShortcutString(event: KeyboardEvent): string | null {
  const modifiers: string[] = [];

  if (event.ctrlKey) modifiers.push('ctrl');
  if (event.shiftKey) modifiers.push('shift');
  if (event.altKey) modifiers.push('alt');
  if (event.metaKey) modifiers.push('meta');

  // Only add non-modifier keys
  const key = event.key.toLowerCase();
  const isModifier = ['control', 'shift', 'alt', 'meta'].includes(key);

  if (isModifier) {
    return null; // Just a modifier, no command
  }

  const parts = [...modifiers, key];
  return parts.sort().join('+');
}

/**
 * Handle keyboard events and execute commands based on shortcuts
 */
export function createKeyDownHandler(commands: CommandsCapability) {
  return (event: KeyboardEvent) => {
    // Don't handle shortcuts if target is an input, textarea, or contentEditable
    const target = event.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
      return;
    }

    const shortcut = buildShortcutString(event);
    if (!shortcut) return;

    const command = commands.getCommandByShortcut(shortcut);
    if (!command) return;

    // Resolve without document ID - will use active document
    const resolved = commands.resolve(command.id);

    if (resolved.disabled || !resolved.visible) {
      return;
    }

    // Execute and prevent default (documentId is optional now)
    event.preventDefault();
    event.stopPropagation();
    commands.execute(command.id, undefined, 'keyboard');
  };
}
