import { describe, expect, it } from 'vitest';

import { closestMatch, didYouMean, editDistance } from '../src/suggestions';

describe('editDistance', () => {
  it('counts inserts, deletes, substitutions and swapped neighbours', () => {
    expect(editDistance('tool:pan', 'tool:pan')).toBe(0);
    expect(editDistance('tool:pann', 'tool:pan')).toBe(1);
    expect(editDistance('tool:pen', 'tool:pan')).toBe(1);
    expect(editDistance('mian', 'main')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('closestMatch', () => {
  it('suggests the closest id within a typo’s reach', () => {
    expect(closestMatch('tool:pann', ['tool:pan', 'tool:pointer'])).toBe('tool:pan');
    expect(closestMatch('mian', ['main', 'menu'])).toBe('main');
  });

  it('suggests nothing for an id that is nowhere near', () => {
    expect(closestMatch('pan:toggle', ['tool:pan'])).toBeNull();
    expect(closestMatch('acme:mine', ['tool:pan'])).toBeNull();
    expect(closestMatch('x', [])).toBeNull();
  });

  it('never suggests the id itself', () => {
    expect(closestMatch('main', ['main'])).toBeNull();
  });
});

describe('didYouMean', () => {
  it('words the suggestion, or says nothing', () => {
    expect(didYouMean('tool:pann', ['tool:pan'])).toBe(' (did you mean "tool:pan"?)');
    expect(didYouMean('acme:mine', ['tool:pan'])).toBe('');
  });
});
