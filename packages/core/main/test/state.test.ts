import { describe, expect, expectTypeOf, it } from 'vitest';
import { createCapabilityToken } from '../src/index';
import { defineState, shallowEqual } from '../src/state';
import type { StateDeclaration } from '../src/state';

type SearchStatus = 'idle' | 'searching' | 'done';

interface FakeSearch {
  getQuery(): string | null;
  getStatus(): SearchStatus;
  getHitCount(): number;
}

const SearchToken = createCapabilityToken<FakeSearch>('search');

describe('defineState', () => {
  it('keeps the token and read, and freezes empty', () => {
    const searchState = defineState(SearchToken, {
      read: (search) => ({
        query: search.getQuery(),
        status: search.getStatus(),
        hitCount: search.getHitCount(),
      }),
      empty: { query: null, status: 'idle', hitCount: 0 },
    });
    expect(searchState.token).toBe(SearchToken);
    const search: FakeSearch = {
      getQuery: () => 'pdf',
      getStatus: () => 'done',
      getHitCount: () => 3,
    };
    expect(searchState.read(search)).toEqual({ query: 'pdf', status: 'done', hitCount: 3 });
    expect(searchState.empty).toEqual({ query: null, status: 'idle', hitCount: 0 });
    expect(Object.isFrozen(searchState.empty)).toBe(true);
  });

  it('takes the state type from read, not from empty', () => {
    const searchState = defineState(SearchToken, {
      read: (search) => ({ query: search.getQuery(), status: search.getStatus() }),
      empty: { query: null, status: 'idle' },
    });
    expectTypeOf(searchState).toEqualTypeOf<
      StateDeclaration<FakeSearch, { query: string | null; status: SearchStatus }>
    >();
  });

  it('refuses an empty that misses a field, has an extra one, or holds the wrong type', () => {
    const read = (search: FakeSearch) => ({
      query: search.getQuery(),
      status: search.getStatus(),
    });
    defineState(SearchToken, {
      read,
      // @ts-expect-error `status` is missing
      empty: { query: null },
    });
    defineState(SearchToken, {
      read: (search) => ({ query: search.getQuery(), status: search.getStatus() }),
      // @ts-expect-error `activeHit` is not a field `read` returns
      empty: { query: null, status: 'idle', activeHit: null },
    });
    defineState(SearchToken, {
      read,
      // @ts-expect-error `waiting` is not a SearchStatus
      empty: { query: null, status: 'waiting' },
    });
  });
});

describe('shallowEqual', () => {
  it('compares objects field by field by identity', () => {
    const hit = { page: 1 };
    expect(shallowEqual({ hit, count: 1 }, { hit, count: 1 })).toBe(true);
    expect(shallowEqual({ hit, count: 1 }, { hit: { page: 1 }, count: 1 })).toBe(false);
    expect(shallowEqual({ count: 1 }, { count: 1, extra: undefined })).toBe(false);
    expect(shallowEqual({ one: undefined }, { two: undefined })).toBe(false);
  });

  it('compares arrays item by item, and anything else by identity', () => {
    const item = { id: 'a' };
    expect(shallowEqual([item, 2], [item, 2])).toBe(true);
    expect(shallowEqual([item], [item, item])).toBe(false);
    expect(shallowEqual([], {})).toBe(false);
    expect(shallowEqual(Number.NaN, Number.NaN)).toBe(true);
    expect(shallowEqual('a', 'a')).toBe(true);
    expect(shallowEqual(null, {})).toBe(false);
  });
});
