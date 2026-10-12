// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import {
  canTakeFocus,
  deepActiveElementOf,
  focusablesIn,
  isUnavailable,
  tabbablesIn,
  usesKey,
} from '../src/focusable';

afterEach(() => {
  document.body.innerHTML = '';
});

const html = (markup: string): HTMLElement => {
  const root = document.createElement('div');
  root.innerHTML = markup;
  document.body.append(root);
  return root;
};

describe('focusablesIn', () => {
  it('finds what takes focus, in order, without the disabled, the hidden and the inert', () => {
    const root = html(`
      <button id="a">A</button>
      <button id="disabled" disabled>B</button>
      <a id="link" href="#">Link</a>
      <a id="anchor">Not a link</a>
      <input id="field" />
      <input id="hidden-input" type="hidden" />
      <span id="programmatic" tabindex="-1">C</span>
      <div hidden><button id="in-hidden">D</button></div>
      <div inert><button id="in-inert">E</button></div>
      <div id="editable" contenteditable="true" tabindex="0">F</div>
      <div id="not-editable" contenteditable="false">G</div>
    `);
    expect(focusablesIn(root).map((element) => element.id)).toEqual([
      'a',
      'link',
      'field',
      'programmatic',
      'editable',
    ]);
    expect(tabbablesIn(root).map((element) => element.id)).toEqual([
      'a',
      'link',
      'field',
      'editable',
    ]);
    expect(canTakeFocus(root.querySelector('#disabled')!)).toBe(false);
  });

  it('takes what a slot shows: the page elements assigned to it, in place of its own content', () => {
    const host = html(`
      <span slot="item"><select id="slotted"><option>One</option></select></span>
      <button id="in-hidden-slot" slot="tucked">Tucked</button>
    `);
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = `
      <button id="before">Before</button>
      <slot name="item"><button id="fallback">Fallback</button></slot>
      <slot name="empty"><button id="shown">Shown</button></slot>
      <div hidden><slot name="tucked"></slot></div>
    `;
    expect(focusablesIn(shadow).map((element) => element.id)).toEqual([
      'before',
      'slotted',
      'shown',
    ]);
  });
});

describe('isUnavailable', () => {
  it('is true for disabled controls and aria-disabled ones', () => {
    const root = html(`
      <button id="on">On</button>
      <button id="off" disabled>Off</button>
      <span id="aria-off" role="button" tabindex="0" aria-disabled="true">Off</span>
    `);
    expect(isUnavailable(root.querySelector('#on')!)).toBe(false);
    expect(isUnavailable(root.querySelector('#off')!)).toBe(true);
    expect(isUnavailable(root.querySelector('#aria-off')!)).toBe(true);
  });
});

describe('usesKey', () => {
  it('leaves a text field its caret keys, a select its Up and Down, a slider every arrow', () => {
    const root = html(`
      <input id="text" />
      <select id="select"><option>One</option></select>
      <input id="range" type="range" />
      <button id="button">B</button>
      <input id="checkbox" type="checkbox" />
    `);
    const element = (id: string) => root.querySelector(`#${id}`)!;
    expect(usesKey(element('text'), 'ArrowLeft')).toBe(true);
    expect(usesKey(element('text'), 'Home')).toBe(true);
    expect(usesKey(element('text'), 'ArrowDown')).toBe(false);
    expect(usesKey(element('select'), 'ArrowDown')).toBe(true);
    expect(usesKey(element('select'), 'ArrowRight')).toBe(false);
    expect(usesKey(element('range'), 'ArrowUp')).toBe(true);
    expect(usesKey(element('range'), 'ArrowRight')).toBe(true);
    expect(usesKey(element('button'), 'ArrowRight')).toBe(false);
    expect(usesKey(element('checkbox'), 'ArrowRight')).toBe(false);
    expect(usesKey(element('text'), 'Enter')).toBe(false);
  });
});

describe('deepActiveElementOf', () => {
  it('looks into shadow roots, and is null while nothing has focus', () => {
    expect(deepActiveElementOf(document)).toBeNull();
    const host = html('');
    const shadow = host.attachShadow({ mode: 'open' });
    shadow.innerHTML = '<button>Inside</button>';
    const inside = shadow.querySelector('button')!;
    inside.focus();
    expect(deepActiveElementOf(document)).toBe(inside);
  });
});
