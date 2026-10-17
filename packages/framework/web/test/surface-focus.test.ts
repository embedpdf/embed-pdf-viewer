// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';

import { createSurfaceFocusFollower } from '../src/surface-focus';

afterEach(() => {
  document.body.innerHTML = '';
});

/** A field with text in it, and a button that has focus. */
function page() {
  document.body.innerHTML = '<button id="elsewhere">Elsewhere</button><input id="field" />';
  const field = document.getElementById('field') as HTMLInputElement;
  field.value = 'contract';
  document.getElementById('elsewhere')!.focus();
  return field;
}

const selectionOf = (field: HTMLInputElement) => [field.selectionStart, field.selectionEnd];

describe('createSurfaceFocusFollower', () => {
  it('focuses on every new request, and never while nothing asks', () => {
    const field = page();
    const shell = {};
    const follower = createSurfaceFocusFollower();
    follower.follow(field, shell, 0);
    expect(document.activeElement).not.toBe(field);

    follower.follow(field, shell, 1);
    expect(document.activeElement).toBe(field);
    field.blur();
    follower.follow(field, shell, 1);
    expect(document.activeElement).not.toBe(field);
    follower.follow(field, shell, 2);
    expect(document.activeElement).toBe(field);
  });

  it('focuses when it starts while a request is up, or its element arrives late', () => {
    const field = page();
    const shell = {};
    createSurfaceFocusFollower().follow(field, shell, 3);
    expect(document.activeElement).toBe(field);

    field.blur();
    const waiting = createSurfaceFocusFollower();
    waiting.follow(null, shell, 1);
    waiting.follow(field, shell, 1);
    expect(document.activeElement).toBe(field);
  });

  it('takes a reopen read after its close as a new request', () => {
    const field = page();
    const shell = {};
    const follower = createSurfaceFocusFollower();
    follower.follow(field, shell, 2);
    field.blur();
    follower.follow(field, shell, 1);
    expect(document.activeElement).toBe(field);
    field.blur();
    follower.follow(field, shell, 0);
    follower.follow(field, shell, 0);
    expect(document.activeElement).not.toBe(field);
  });

  it("starts over for another document's shell", () => {
    const field = page();
    const follower = createSurfaceFocusFollower();
    follower.follow(field, { document: 'a' }, 1);
    field.blur();
    follower.follow(field, null, 0);
    follower.follow(field, { document: 'b' }, 1);
    expect(document.activeElement).toBe(field);
  });

  it('selects the text with select, and leaves the caret alone without it', () => {
    const field = page();
    field.setSelectionRange(8, 8);
    const plain = createSurfaceFocusFollower();
    plain.follow(field, {}, 1);
    expect(selectionOf(field)).toEqual([8, 8]);

    field.blur();
    createSurfaceFocusFollower().follow(field, {}, 1, { select: true });
    expect(document.activeElement).toBe(field);
    expect(selectionOf(field)).toEqual([0, 8]);
  });
});
