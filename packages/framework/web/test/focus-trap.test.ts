// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { attachFocusTrap } from '../src/focus-trap';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A page with a button that opened a dialog of three controls (the middle one out of the tab order). */
function page() {
  document.body.innerHTML = `
    <button id="opener">Open</button>
    <div id="dialog">
      <input id="name" />
      <button id="help" tabindex="-1">Help</button>
      <button id="save">Save</button>
    </div>
    <button id="behind">Behind</button>
  `;
  const byId = (id: string) => document.getElementById(id)!;
  byId('opener').focus();
  return byId;
}

const tab = (shiftKey = false) => {
  const event = new KeyboardEvent('keydown', {
    key: 'Tab',
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  document.activeElement!.dispatchEvent(event);
  return event;
};

describe('attachFocusTrap', () => {
  it('takes focus on its first control that Tab stops at, or the one named', () => {
    const byId = page();
    const release = attachFocusTrap(byId('dialog'));
    expect(document.activeElement).toBe(byId('name'));
    release();
    attachFocusTrap(byId('dialog'), { initialFocus: byId('save') });
    expect(document.activeElement).toBe(byId('save'));
  });

  it('goes round its controls with Tab and Shift+Tab', () => {
    const byId = page();
    attachFocusTrap(byId('dialog'));
    expect(tab(true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('save'));
    expect(tab().defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(byId('name'));
    // Inside, Tab is the browser's own.
    expect(tab().defaultPrevented).toBe(false);
  });

  it('brings focus that lands outside back to the control that had it', () => {
    const byId = page();
    attachFocusTrap(byId('dialog'));
    byId('save').focus();
    byId('behind').focus();
    expect(document.activeElement).toBe(byId('save'));
  });

  it('holds focus on the container when nothing in it takes Tab', () => {
    document.body.innerHTML = '<div id="empty">Nothing here</div>';
    const empty = document.getElementById('empty')!;
    attachFocusTrap(empty);
    expect(document.activeElement).toBe(empty);
    expect(tab().defaultPrevented).toBe(true);
  });

  it('returns focus to where it was when released, unless told not to', () => {
    const byId = page();
    attachFocusTrap(byId('dialog'))();
    expect(document.activeElement).toBe(byId('opener'));

    attachFocusTrap(byId('dialog'), { returnFocus: false })();
    expect(document.activeElement).toBe(byId('name'));
  });

  it('lets only the trap started last act, until it is released', () => {
    const byId = page();
    const outer = byId('dialog');
    const inner = document.createElement('div');
    inner.innerHTML = '<button id="inner">Inner</button>';
    document.body.append(inner);
    const releaseOuter = attachFocusTrap(outer);
    const releaseInner = attachFocusTrap(inner);
    expect(document.activeElement).toBe(byId('inner'));
    byId('behind').focus();
    expect(document.activeElement).toBe(byId('inner'));

    releaseInner();
    expect(document.activeElement).toBe(byId('name'));
    byId('behind').focus();
    expect(document.activeElement).toBe(byId('name'));
    releaseOuter();
    expect(document.activeElement).toBe(byId('opener'));
  });
});
