/**
 * The clipboard wiring against a fake document (the repo's no-jsdom pattern): a
 * selection the user may not copy is refused on Ctrl/Cmd+C and on a copy, and said so.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

import { wireSelectionClipboard, type ClipboardSelectionSource } from '../src/clipboard';

/** A document stand-in that dispatches to its listeners by type. */
function fakeDocument() {
  const listeners = new Map<string, (event: Event) => void>();
  const dispatch = <Init extends object>(type: string, init: Init) => {
    const event = { defaultPrevented: false, preventDefault: vi.fn(), ...init };
    listeners.get(type)?.(event as unknown as Event);
    return event;
  };
  return {
    addEventListener: (type: string, listener: (event: Event) => void) =>
      listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getSelection: () => ({ isCollapsed: true }),
    pressCopy(target: Partial<HTMLElement> = { tagName: 'DIV' }) {
      return dispatch('keydown', {
        key: 'c',
        ctrlKey: true,
        metaKey: false,
        shiftKey: false,
        altKey: false,
        target,
      });
    },
    copy(target: Partial<HTMLElement> = { tagName: 'DIV' }) {
      return dispatch('copy', { target, clipboardData: { setData: vi.fn() } });
    },
  };
}

function selectionWith(state: { selected: boolean; mayCopy: boolean }): ClipboardSelectionSource {
  return {
    hasSelection: () => state.selected,
    canCopy: () => state.mayCopy,
    readText: vi.fn(async () => 'text'),
    onChanged: () => () => {},
    onCommitted: () => () => {},
  };
}

describe('wireSelectionClipboard', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('refuses Ctrl/Cmd+C and a copy of a selection the user may not copy, and says so', () => {
    const target = fakeDocument();
    const selection = selectionWith({ selected: true, mayCopy: false });
    const onRefused = vi.fn();
    wireSelectionClipboard(selection, { target: target as unknown as Document, onRefused });

    const key = target.pressCopy();
    const copy = target.copy();
    expect(key.preventDefault).toHaveBeenCalled();
    expect(copy.preventDefault).toHaveBeenCalled();
    expect(copy.clipboardData.setData).not.toHaveBeenCalled();
    expect(onRefused).toHaveBeenCalledTimes(2);
    expect(selection.readText).not.toHaveBeenCalled();
  });

  it('leaves the keys alone with nothing selected, in a text field, or once a shortcut took them', () => {
    const target = fakeDocument();
    const state = { selected: false, mayCopy: false };
    const onRefused = vi.fn();
    wireSelectionClipboard(selectionWith(state), {
      target: target as unknown as Document,
      onRefused,
    });

    expect(target.pressCopy().preventDefault).not.toHaveBeenCalled();
    state.selected = true;
    expect(target.pressCopy({ tagName: 'INPUT' }).preventDefault).not.toHaveBeenCalled();
    expect(target.copy({ tagName: 'TEXTAREA' }).preventDefault).not.toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });

  it('copies a selection the user may copy', () => {
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const target = fakeDocument();
    const selection = selectionWith({ selected: true, mayCopy: true });
    const onRefused = vi.fn();
    wireSelectionClipboard(selection, { target: target as unknown as Document, onRefused });

    expect(target.pressCopy().preventDefault).not.toHaveBeenCalled();
    expect(selection.readText).toHaveBeenCalled();
    expect(onRefused).not.toHaveBeenCalled();
  });
});
