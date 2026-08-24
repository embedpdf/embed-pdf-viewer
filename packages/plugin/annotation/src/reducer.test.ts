import { describe, expect, it } from 'vitest';
import { annotationReducer, DEFAULT_CHROME, initialAnnotationState } from './reducer';

describe('chrome settings state', () => {
  it('registration config deep-merges over DEFAULT_CHROME', () => {
    const s = initialAnnotationState({ chrome: { accent: '#e91e63', knob: { offset: 48 } } });
    expect(s.chrome.accent).toBe('#e91e63');
    expect(s.chrome.knob.offset).toBe(48);
    // untouched keys survive the merge — a partial patch never drops defaults
    expect(s.chrome.knob.hitSize).toBe(DEFAULT_CHROME.knob.hitSize);
    expect(s.chrome.guides.enabled).toBe(true);
    expect(s.chrome.outline.style).toBe('solid');
  });

  it('SET_CHROME patches at runtime without touching the model', () => {
    const s0 = initialAnnotationState();
    const s1 = annotationReducer(s0, {
      type: 'SET_CHROME',
      patch: { guides: { enabled: false }, outline: { style: 'dashed' } },
    });
    expect(s1.chrome.guides.enabled).toBe(false);
    expect(s1.chrome.guides.axisOpacity).toBe(DEFAULT_CHROME.guides.axisOpacity);
    expect(s1.chrome.outline.style).toBe('dashed');
    expect(s1.chrome.outline.width).toBe(DEFAULT_CHROME.outline.width);
    expect(s1.model).toBe(s0.model); // settings and model are independent slices
  });
});
