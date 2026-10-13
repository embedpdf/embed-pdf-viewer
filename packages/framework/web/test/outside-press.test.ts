import { describe, expect, it, vi } from 'vitest';

import { observeOutsidePress } from '../src/outside-press';
import { asElement, fakeElement } from './helpers/fake-element';

describe('observeOutsidePress', () => {
  it('reports presses whose composed path misses the element, until stopped', () => {
    const doc = fakeElement();
    const menu = { ownerDocument: doc };
    // At the document, a press inside a shadow root targets the host; its path still has the menu.
    const host = {};
    const onPress = vi.fn();
    const stop = observeOutsidePress(asElement<Element>(menu), onPress);

    doc.dispatch('pointerdown', { target: host, composedPath: () => [{}, menu, host, doc] });
    expect(onPress).not.toHaveBeenCalled();

    doc.dispatch('pointerdown', { target: host, composedPath: () => [{}, host, doc] });
    expect(onPress).toHaveBeenCalledTimes(1);

    stop();
    expect(doc.listenerCount('pointerdown')).toBe(0);
  });
});
