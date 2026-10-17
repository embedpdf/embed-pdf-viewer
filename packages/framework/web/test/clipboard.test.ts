// @vitest-environment happy-dom
/**
 * The clipboard wiring: a selection the user may not copy is refused on Ctrl/Cmd+C and on a
 * copy, and said so (against a fake document); with an element as its target, it takes keys
 * and copies only while focus is inside that element, Edit → Copy's at the body included, and
 * reads the DOM selection from the element's root (against happy-dom).
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
  const fake = {
    addEventListener: (type: string, listener: (event: Event) => void) =>
      listeners.set(type, listener),
    removeEventListener: (type: string) => listeners.delete(type),
    getRootNode: () => fake,
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
  return fake;
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

// ── with an element as target ──

/** Let the clipboard reads and writes in flight finish. */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A copyable selection whose text arrives on commit, as the plugin's does when a drag ends. */
function committedSelection() {
  const committed = new Set<() => void>();
  const selection: ClipboardSelectionSource = {
    hasSelection: () => true,
    canCopy: () => true,
    readText: vi.fn(async () => 'selected text'),
    onChanged: () => () => {},
    onCommitted: (listener) => {
      committed.add(listener);
      return () => committed.delete(listener);
    },
  };
  /** End the gesture, and let the prefetched text arrive. */
  const commit = async () => {
    for (const listener of committed) listener();
    await settle();
  };
  return { selection, commit };
}

const pressCopy = (target: EventTarget) => {
  const event = new KeyboardEvent('keydown', {
    key: 'c',
    ctrlKey: true,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  target.dispatchEvent(event);
  return event;
};

/** A copy event (Edit → Copy) with a clipboard to write to. */
const copyFrom = (target: EventTarget) => {
  const event = new Event('copy', { bubbles: true, cancelable: true, composed: true });
  const setData = vi.fn();
  Object.defineProperty(event, 'clipboardData', { value: { setData } });
  target.dispatchEvent(event);
  return { event, setData };
};

describe('wireSelectionClipboard with an element as target', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  /**
   * Two viewers' roots, each with a page inside and the first with a field inside, and a button
   * on the page outside.
   */
  function page() {
    document.body.innerHTML = `
      <div id="viewer" tabindex="-1"><div id="pages"></div><input id="search" /></div>
      <div id="other" tabindex="-1"><div id="other-pages"></div></div>
      <button id="outside">Page button</button>
    `;
    const byId = (id: string) => document.getElementById(id)!;
    const writeText = vi.fn(async () => {});
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    return { byId, writeText };
  }

  it('copies on Ctrl/Cmd+C and on a copy while focus is inside it, and leaves the page alone', async () => {
    const { byId, writeText } = page();
    const { selection, commit } = committedSelection();
    const unwire = wireSelectionClipboard(selection, { target: byId('viewer') });
    await commit();

    byId('viewer').focus();
    expect(pressCopy(byId('pages')).defaultPrevented).toBe(false);
    await settle();
    expect(writeText).toHaveBeenCalledWith('selected text');
    const inside = copyFrom(byId('pages'));
    expect(inside.setData).toHaveBeenCalledWith('text/plain', 'selected text');
    expect(inside.event.defaultPrevented).toBe(true);

    writeText.mockClear();
    byId('outside').focus();
    pressCopy(byId('outside'));
    const outside = copyFrom(byId('outside'));
    await settle();
    expect(writeText).not.toHaveBeenCalled();
    expect(outside.setData).not.toHaveBeenCalled();
    expect(outside.event.defaultPrevented).toBe(false);

    unwire();
    byId('viewer').focus();
    pressCopy(byId('pages'));
    expect(copyFrom(byId('pages')).setData).not.toHaveBeenCalled();
    await settle();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("answers Edit → Copy, which reaches the page's body, while focus is inside it", async () => {
    const { byId } = page();
    const { selection, commit } = committedSelection();
    wireSelectionClipboard(selection, { target: byId('viewer') });
    await commit();

    byId('pages').tabIndex = -1;
    byId('pages').focus();
    const menu = copyFrom(document.body);
    expect(menu.setData).toHaveBeenCalledWith('text/plain', 'selected text');
    expect(menu.event.defaultPrevented).toBe(true);

    byId('outside').focus();
    const elsewhere = copyFrom(document.body);
    expect(elsewhere.setData).not.toHaveBeenCalled();
    expect(elsewhere.event.defaultPrevented).toBe(false);
  });

  it('gives each of two viewers only the keys and copies made while focus is in it', async () => {
    const { byId, writeText } = page();
    const first = committedSelection();
    const second = committedSelection();
    vi.mocked(second.selection.readText).mockResolvedValue('other text');
    wireSelectionClipboard(first.selection, { target: byId('viewer') });
    wireSelectionClipboard(second.selection, { target: byId('other') });
    await first.commit();
    await second.commit();

    byId('other').focus();
    pressCopy(byId('other-pages'));
    await settle();
    expect(writeText.mock.calls).toEqual([['other text']]);
    const copy = copyFrom(document.body);
    expect(copy.setData.mock.calls).toEqual([['text/plain', 'other text']]);
  });

  it('leaves a key or a copy in a text field inside it to the field', async () => {
    const { byId, writeText } = page();
    const { selection, commit } = committedSelection();
    wireSelectionClipboard(selection, { target: byId('viewer') });
    await commit();

    byId('search').focus();
    pressCopy(byId('search'));
    const copy = copyFrom(byId('search'));
    await settle();
    expect(writeText).not.toHaveBeenCalled();
    expect(copy.setData).not.toHaveBeenCalled();
    expect(copy.event.defaultPrevented).toBe(false);
  });

  it("reads the DOM selection from the element's shadow root, where the browser copies from", async () => {
    const { writeText } = page();
    const host = document.createElement('div');
    document.body.append(host);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `<div id="viewer" tabindex="-1"><div id="pages"></div></div>`;
    const domSelection = { isCollapsed: false };
    Object.defineProperty(shadow, 'getSelection', { value: () => domSelection });
    const { selection, commit } = committedSelection();
    wireSelectionClipboard(selection, { target: shadow.getElementById('viewer')! });
    await commit();

    // Text selected in the shadow root: the browser copies it, and the copy event answers.
    shadow.getElementById('viewer')!.focus();
    pressCopy(shadow.getElementById('pages')!);
    await settle();
    expect(writeText).not.toHaveBeenCalled();

    domSelection.isCollapsed = true;
    pressCopy(shadow.getElementById('pages')!);
    await settle();
    expect(writeText).toHaveBeenCalledWith('selected text');
  });
});
