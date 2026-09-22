import { describe, expect, it } from 'vitest';

import { DEFAULT_CHROME, initialAnnotationState, patchChrome } from '../src/model';

describe('chrome settings state', () => {
  it('registration config deep-merges over DEFAULT_CHROME', () => {
    const state = initialAnnotationState({ chrome: { accent: '#e91e63', knob: { offset: 48 } } });
    expect(state.chrome.accent).toBe('#e91e63');
    expect(state.chrome.knob.offset).toBe(48);
    // Untouched keys survive the merge: a partial patch never drops defaults.
    expect(state.chrome.knob.hitSize).toBe(DEFAULT_CHROME.knob.hitSize);
    expect(state.chrome.guides.enabled).toBe(true);
    expect(state.chrome.outline.style).toBe('solid');
  });

  it('patchChrome changes settings at runtime without touching the model', () => {
    const before = initialAnnotationState();
    const after = patchChrome(before, { guides: { enabled: false }, outline: { style: 'dashed' } });
    expect(after.chrome.guides.enabled).toBe(false);
    expect(after.chrome.guides.axisOpacity).toBe(DEFAULT_CHROME.guides.axisOpacity);
    expect(after.chrome.outline.style).toBe('dashed');
    expect(after.chrome.outline.width).toBe(DEFAULT_CHROME.outline.width);
    expect(after.model).toBe(before.model);
  });
});
