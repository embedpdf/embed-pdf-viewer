import { describe, expect, it } from 'vitest';

import { composeApi } from '../src/compose';

describe('composeApi', () => {
  it('spreads the slices into one api and keeps every member', () => {
    const api = composeApi('demo', [{ a: () => 1 }, { b: () => 2 }, { onX: () => () => {} }]);
    expect(api.a()).toBe(1);
    expect(api.b()).toBe(2);
    expect(Object.keys(api)).toEqual(['a', 'b', 'onX']);
  });

  it('refuses a member two slices both define, naming the capability and the key', () => {
    expect(() => composeApi('demo', [{ a: 1 }, { b: 2 }, { a: 3 }])).toThrow(
      "[demo] api member 'a' is defined twice",
    );
  });
});
