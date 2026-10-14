import { describe, expect, it } from 'vitest';

import { cssText } from '../src/css-text';

describe('cssText', () => {
  it('writes a style record as CSS text, in its order, with kebab-case names', () => {
    expect(cssText({ strokeWidth: 1.5, fontFamily: 'Helvetica', zIndex: 1 })).toBe(
      'stroke-width: 1.5; font-family: Helvetica; z-index: 1',
    );
  });

  it('leaves out what is unset', () => {
    expect(cssText({ color: 'red', boxShadow: undefined, outline: null })).toBe('color: red');
    expect(cssText({})).toBe('');
  });

  it('takes an interface as it is, without spreading it first', () => {
    interface Paint {
      stroke: string;
      fill?: string;
    }
    const paint: Paint = { stroke: 'var(--epdf-accent, blue)' };
    expect(cssText(paint)).toBe('stroke: var(--epdf-accent, blue)');
  });
});
