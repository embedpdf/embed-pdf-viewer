// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { TOOLBAR_ITEM_ATTRIBUTE, attachToolbarFocus, toolbarStopsOf } from '../src/toolbar-focus';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A toolbar's live row: a command, a custom item with two controls, and "More" holding its menu open. */
function toolbar() {
  const element = document.createElement('div');
  element.innerHTML = `
    <span ${TOOLBAR_ITEM_ATTRIBUTE}><button id="zoom-in">Zoom in</button></span>
    <span ${TOOLBAR_ITEM_ATTRIBUTE}>
      <label>Page <input id="page" /></label>
      <button id="go">Go</button>
    </span>
    <span ${TOOLBAR_ITEM_ATTRIBUTE}>
      <button id="more">More</button>
      <div role="menu"><button id="row" role="menuitem">Print</button></div>
    </span>
    <span ${TOOLBAR_ITEM_ATTRIBUTE}><span>Nothing to focus</span></span>
  `;
  document.body.append(element);
  return element;
}

describe('toolbarStopsOf', () => {
  it('is the first control of each item, never a row of a menu it holds', () => {
    expect(toolbarStopsOf(toolbar()).map((stop) => stop.id)).toEqual(['zoom-in', 'page', 'more']);
  });
});

describe('attachToolbarFocus', () => {
  it('moves between the items along the toolbar, leaving a custom item’s other controls to it', () => {
    const element = toolbar();
    attachToolbarFocus(element, 'vertical');
    const byId = (id: string) => element.querySelector<HTMLElement>(`#${id}`)!;
    expect(byId('go').tabIndex).toBe(0);
    expect([byId('zoom-in'), byId('page'), byId('more')].map((stop) => stop.tabIndex)).toEqual([
      0, -1, -1,
    ]);

    byId('zoom-in').focus();
    byId('zoom-in').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }),
    );
    expect(document.activeElement).toBe(byId('page'));
  });
});
