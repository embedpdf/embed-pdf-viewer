import { describe, expect, it } from 'vitest';
import type { PageImageHandle } from '@embedpdf/core';

import { RasterStore } from './raster-store';

const handle = (id: string) => ({ id }) as unknown as PageImageHandle;
const ready = (id: string) => () => Promise.resolve(handle(id));

describe('RasterStore', () => {
  it('singleflight: concurrent acquires of one key run the fetch once', async () => {
    const store = new RasterStore();
    let fetches = 0;
    let resolveFn!: (h: PageImageHandle) => void;
    const fetch = () => {
      fetches += 1;
      return new Promise<PageImageHandle>((res) => {
        resolveFn = res;
      });
    };
    const a = store.acquire('k', fetch);
    const b = store.acquire('k', fetch);
    expect(fetches).toBe(1);
    resolveFn(handle('one'));
    expect(await a).toBe(await b);
  });

  it('resolved entries serve synchronously via peek and survive aborts', async () => {
    const store = new RasterStore();
    await store.acquire('k', ready('one'));
    expect(store.peek('k')).toEqual(handle('one'));
    // An abort AFTER resolution is a no-op — the cache keeps the raster.
    const ac = new AbortController();
    const again = store.acquire('k', ready('two'), ac.signal);
    ac.abort();
    expect(store.peek('k')).toEqual(handle('one'));
    await again.catch(() => {}); // wrapper may reject; entry must survive
    expect(store.peek('k')).toEqual(handle('one'));
  });

  it('a failed fetch is not sticky — the next acquire retries', async () => {
    const store = new RasterStore();
    await expect(store.acquire('k', () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );
    expect(await store.acquire('k', ready('retry'))).toEqual(handle('retry'));
  });

  it('LRU eviction: oldest consumer-free resolved entries go first, capacity holds', async () => {
    const store = new RasterStore(3);
    await store.acquire('a', ready('a'));
    await store.acquire('b', ready('b'));
    await store.acquire('c', ready('c'));
    store.peek('a'); // freshen 'a' — 'b' is now the LRU candidate
    await store.acquire('d', ready('d'));
    expect(store.size).toBe(3);
    expect(store.peek('b')).toBeUndefined();
    expect(store.peek('a')).toEqual(handle('a'));
    expect(store.peek('d')).toEqual(handle('d'));
  });

  it('in-flight entries are never evicted, even over capacity', async () => {
    const store = new RasterStore(1);
    let resolveFn!: (h: PageImageHandle) => void;
    const pending = store.acquire(
      'slow',
      () =>
        new Promise<PageImageHandle>((res) => {
          resolveFn = res;
        }),
    );
    await store.acquire('fast', ready('fast'));
    resolveFn(handle('slow'));
    expect(await pending).toEqual(handle('slow'));
  });
});
