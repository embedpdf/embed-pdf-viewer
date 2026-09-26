import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';
import {
  IdlePageCache,
  type IdlePageCachePolicy,
} from '../../services/src/document-session/pages/IdlePageCache';
import { PagePtrPool } from '../../services/src/document-session/pages/PagePtrPool';

const DOC = 1n as Ptr;
const pon = (value: number) => value as PageObjectNumber;

/** Page object number → object count; pages above 1000 objects are heavy under `policy`. */
function createFakeRuntime(objects: Record<number, number>, options = { canReset: true }) {
  let nextPtr = 100n;
  const pageOf = new Map<Ptr, number>();
  const calls = {
    loads: [] as number[],
    closes: [] as number[],
    resets: [] as number[],
  };
  const fn: Record<string, unknown> = {
    EPDFDoc_LoadPageByObjectNumberNormalized: (_doc: Ptr, objectNumber: number) => {
      const ptr = nextPtr++ as Ptr;
      pageOf.set(ptr, objectNumber);
      calls.loads.push(objectNumber);
      return ptr;
    },
    FPDFPage_CountObjects: (ptr: Ptr) => objects[pageOf.get(ptr)!] ?? 0,
    FPDF_ClosePage: (ptr: Ptr) => {
      calls.closes.push(pageOf.get(ptr)!);
    },
  };
  if (options.canReset) {
    fn.EPDFPage_ResetRenderCache = (ptr: Ptr) => {
      calls.resets.push(pageOf.get(ptr)!);
      return true;
    };
  }
  return { runtime: { fn } as unknown as PdfRuntimeModule, calls };
}

const policy: IdlePageCachePolicy = { heavyObjects: 1000, maxLightPages: 2, idleMs: 0 };

/** Acquires and releases a page, as one job's reader does. */
function use(pool: PagePtrPool, objectNumber: number): void {
  pool.acquire(pon(objectNumber));
  pool.release(pon(objectNumber));
}

describe('IdlePageCache with PagePtrPool', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('keeps a page a read-only job released and hands it back without loading it again', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);
    cache.beginJob(true);
    use(pool, 1);

    expect(calls.loads).toEqual([1]);
    expect(calls.closes).toEqual([]);
    expect(cache.size).toBe(1);
  });

  test('empties the image cache of every page it keeps', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);
    cache.beginJob(true);
    use(pool, 1);

    expect(calls.resets).toEqual([1, 1]);
  });

  test('closes every idle page before a job that is not read-only, and the pages that job releases', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10, 2: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);
    cache.beginJob(false);
    expect(calls.closes).toEqual([1]);

    use(pool, 2);
    expect(calls.closes).toEqual([1, 2]);
    expect(cache.size).toBe(0);
  });

  test('does not hand a page held by a running job to the cache', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    pool.acquire(pon(1));
    pool.acquire(pon(1));
    pool.release(pon(1));
    expect(pool.isHeld(pon(1))).toBe(true);
    expect(cache.size).toBe(0);

    pool.release(pon(1));
    expect(pool.isHeld(pon(1))).toBe(false);
    expect(cache.size).toBe(1);
    expect(calls.closes).toEqual([]);
  });

  test('closes an idle heavy page before a page that is not cached loads', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 5000, 2: 10, 3: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);
    use(pool, 2);
    expect(calls.closes).toEqual([1]);

    use(pool, 2);
    expect(calls.loads).toEqual([1, 2]);
    use(pool, 3);
    expect(calls.closes).toEqual([1]);
  });

  test('keeps at most maxLightPages light pages, closing the least recently released', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10, 2: 10, 3: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);
    use(pool, 2);
    use(pool, 3);

    expect(calls.closes).toEqual([1]);
    expect(cache.size).toBe(2);
  });

  test('shares one budget between documents', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 5000, 2: 5000 });
    const cache = new IdlePageCache(runtime, policy);
    const first = new PagePtrPool(runtime, DOC, cache);
    const second = new PagePtrPool(runtime, 2n as Ptr, cache);

    cache.beginJob(true);
    use(first, 1);
    use(second, 2);

    expect(calls.closes).toEqual([1]);
    expect(cache.size).toBe(1);
  });

  test("closes a pool's idle pages when the pool closes", () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10, 2: 10 });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);
    const other = new PagePtrPool(runtime, 2n as Ptr, cache);

    cache.beginJob(true);
    use(pool, 1);
    use(other, 2);
    pool.closeAll();

    expect(calls.closes).toEqual([1]);
    expect(cache.size).toBe(1);
  });

  test('closes idle pages once they have been idle for idleMs', () => {
    vi.useFakeTimers();
    const { runtime, calls } = createFakeRuntime({ 1: 10 });
    const cache = new IdlePageCache(runtime, { ...policy, idleMs: 1000 });
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);
    vi.advanceTimersByTime(999);
    expect(calls.closes).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(calls.closes).toEqual([1]);
  });

  test('keeps nothing on a runtime without EPDFPage_ResetRenderCache', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10 }, { canReset: false });
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);

    expect(cache.enabled).toBe(false);
    expect(calls.closes).toEqual([1]);
  });

  test('closes a page whose image cache cannot be emptied', () => {
    const { runtime, calls } = createFakeRuntime({ 1: 10 });
    (runtime.fn as unknown as Record<string, unknown>).EPDFPage_ResetRenderCache = () => false;
    const cache = new IdlePageCache(runtime, policy);
    const pool = new PagePtrPool(runtime, DOC, cache);

    cache.beginJob(true);
    use(pool, 1);

    expect(calls.closes).toEqual([1]);
    expect(cache.size).toBe(0);
  });
});
