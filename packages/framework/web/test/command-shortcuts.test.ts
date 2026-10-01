import { describe, expect, it, vi } from 'vitest';

import { bindCommandShortcuts, type ShortcutCommands } from '../src/command-shortcuts';

/** A window stand-in that dispatches to its one keydown listener. */
function fakeTarget() {
  let listener: ((event: Event) => void) | null = null;
  return {
    addEventListener: (_type: string, handler: (event: Event) => void) => (listener = handler),
    removeEventListener: () => (listener = null),
    press(key: string, target: Partial<HTMLElement> = { tagName: 'DIV' }) {
      const event = {
        key,
        target,
        defaultPrevented: false,
        preventDefault: vi.fn(),
      };
      listener?.(event as unknown as Event);
      return event;
    },
    get listening() {
      return listener !== null;
    },
  };
}

function commandsWith(enabled: Record<string, boolean>): ShortcutCommands & {
  execute: ReturnType<typeof vi.fn>;
} {
  return {
    matchStroke: (stroke) => (stroke.key in enabled ? stroke.key : null),
    canExecute: (id) => enabled[id] ?? false,
    execute: vi.fn(async () => ({ status: 'executed' })),
  };
}

describe('bindCommandShortcuts', () => {
  it("runs the command a key matches, and replaces the key's browser default", () => {
    const target = fakeTarget();
    const commands = commandsWith({ ArrowRight: true });
    bindCommandShortcuts(commands, { isMac: true, target });
    const event = target.press('ArrowRight');
    expect(commands.execute).toHaveBeenCalledWith('ArrowRight');
    expect(event.preventDefault).toHaveBeenCalled();
  });

  it("leaves a key alone when its command can't run, or when it's typed into a field", () => {
    const target = fakeTarget();
    const commands = commandsWith({ c: false, ArrowRight: true });
    bindCommandShortcuts(commands, { isMac: true, target });
    const copy = target.press('c');
    const typed = target.press('ArrowRight', { tagName: 'INPUT' });
    const edited = target.press('ArrowRight', { tagName: 'DIV', isContentEditable: true });
    expect(commands.execute).not.toHaveBeenCalled();
    for (const event of [copy, typed, edited]) expect(event.preventDefault).not.toHaveBeenCalled();
  });

  it('stops listening when unbound', () => {
    const target = fakeTarget();
    const unbind = bindCommandShortcuts(commandsWith({}), { isMac: false, target });
    expect(target.listening).toBe(true);
    unbind();
    expect(target.listening).toBe(false);
  });
});
