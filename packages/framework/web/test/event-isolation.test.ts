import { describe, expect, it } from 'vitest';

import { isolatePointerDown, isolateWheel } from '../src/event-isolation';
import { asElement, fakeElement } from './helpers/fake-element';

describe('event isolation', () => {
  it('stops presses and wheels at the element, until detached', () => {
    const element = fakeElement();
    const detachPress = isolatePointerDown(asElement(element));
    const detachWheel = isolateWheel(asElement(element));
    expect(element.dispatch('pointerdown').stopped).toBe(true);
    expect(element.dispatch('wheel').stopped).toBe(true);
    detachPress();
    detachWheel();
    expect(element.dispatch('pointerdown').stopped).toBe(false);
    expect(element.dispatch('wheel').stopped).toBe(false);
  });

  it('tells the control about each press it stops', () => {
    const element = fakeElement();
    let presses = 0;
    const detach = isolatePointerDown(asElement(element), () => presses++);
    expect(element.dispatch('pointerdown').stopped).toBe(true);
    expect(presses).toBe(1);
    detach();
    element.dispatch('pointerdown');
    expect(presses).toBe(1);
  });
});
