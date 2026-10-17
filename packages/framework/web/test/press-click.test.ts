import { describe, expect, it } from 'vitest';

import { createClickDetector } from '../src/press-click';

describe('createClickDetector', () => {
  it('counts a press that stays put as a click, and one that travelled as a drag', () => {
    const clicks = createClickDetector();
    clicks.press({ clientX: 10, clientY: 10, pointerType: 'mouse' });
    expect(clicks.isClick({ clientX: 13, clientY: 10 })).toBe(true);
    clicks.press({ clientX: 10, clientY: 10, pointerType: 'mouse' });
    expect(clicks.isClick({ clientX: 14, clientY: 10 })).toBe(false);
  });

  it('lets a finger wobble more, and treats a click with no press as a click', () => {
    const clicks = createClickDetector();
    clicks.press({ clientX: 0, clientY: 0, pointerType: 'touch' });
    expect(clicks.isClick({ clientX: 6, clientY: 6 })).toBe(true);
    // The press is forgotten once asked.
    expect(clicks.isClick({ clientX: 100, clientY: 100 })).toBe(true);
  });
});
