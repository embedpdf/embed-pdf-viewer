import { describe, expect, it, vi } from 'vitest';

import {
  bindCommandShortcuts,
  type ShortcutCommands,
  type ShortcutRefusal,
} from '../src/command-shortcuts';

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

/**
 * Commands named by their key: enabled or not right now, some refused for good, and some that
 * run from text fields, as the commands plugin matches them.
 */
function commandsWith(
  enabled: Record<string, boolean>,
  refusals: Record<string, ShortcutRefusal> = {},
  inTextFields: readonly string[] = [],
): ShortcutCommands & {
  execute: ReturnType<typeof vi.fn>;
} {
  return {
    matchStroke: (stroke, { inTextField }) =>
      (stroke.key in enabled || stroke.key in refusals) &&
      (!inTextField || inTextFields.includes(stroke.key))
        ? { commandId: stroke.key, refusal: refusals[stroke.key] ?? null }
        : null,
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

  it('runs a command that says it runs from text fields when its key is typed in one', () => {
    const target = fakeTarget();
    const commands = commandsWith({ f: true, ArrowRight: true }, {}, ['f']);
    bindCommandShortcuts(commands, { isMac: true, target });
    const find = target.press('f', { tagName: 'INPUT' });
    const caret = target.press('ArrowRight', { tagName: 'INPUT' });
    expect(commands.execute.mock.calls).toEqual([['f']]);
    expect(find.preventDefault).toHaveBeenCalled();
    expect(caret.preventDefault).not.toHaveBeenCalled();
  });

  it('takes the key of a command that is turned off or not allowed, and says why', () => {
    const target = fakeTarget();
    const notAllowed: ShortcutRefusal = {
      reason: 'not-allowed',
      message: "Printing isn't allowed",
    };
    const turnedOff: ShortcutRefusal = { reason: 'turned-off', message: "Save isn't available" };
    const commands = commandsWith({}, { p: notAllowed, s: turnedOff });
    const onRefused = vi.fn();
    bindCommandShortcuts(commands, { isMac: true, target, onRefused });

    const print = target.press('p');
    const save = target.press('s');
    expect(print.preventDefault).toHaveBeenCalled();
    expect(save.preventDefault).toHaveBeenCalled();
    expect(onRefused.mock.calls).toEqual([
      ['p', notAllowed],
      ['s', turnedOff],
    ]);
    expect(commands.execute).not.toHaveBeenCalled();
  });

  it('takes a refused key even without onRefused, but never one typed into a field', () => {
    const target = fakeTarget();
    const refusal: ShortcutRefusal = { reason: 'not-allowed', message: "Printing isn't allowed" };
    bindCommandShortcuts(commandsWith({}, { p: refusal }), { isMac: true, target });
    expect(target.press('p').preventDefault).toHaveBeenCalled();
    expect(target.press('p', { tagName: 'TEXTAREA' }).preventDefault).not.toHaveBeenCalled();
  });

  it('stops listening when unbound', () => {
    const target = fakeTarget();
    const unbind = bindCommandShortcuts(commandsWith({}), { isMac: false, target });
    expect(target.listening).toBe(true);
    unbind();
    expect(target.listening).toBe(false);
  });
});
