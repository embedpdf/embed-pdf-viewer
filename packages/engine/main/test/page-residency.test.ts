/**
 * The runtime's parsed pages, kept within a budget of bytes (PageResidency),
 * against a fake runtime: each page parses into a known number of bytes, over
 * a known number of slices, and can be told its content changed. What the
 * viewers show (working sets) decides which kept pages close first.
 */
import { afterEach, describe, expect, test, vi } from 'vitest';
import type { PageObjectNumber } from '@embedpdf/engine-core/runtime';
import type { PdfRuntimeModule, Ptr } from '@embedpdf/engine-runtime';
import {
  PAGE_OVERHEAD_BYTES,
  PageResidency,
} from '../../services/src/document-session/pages/PageResidency';
import { PagePtrPool } from '../../services/src/document-session/pages/PagePtrPool';

const DOC = 1n as Ptr;
const pon = (value: number) => value as PageObjectNumber;
const MB = 1024 * 1024;

interface FakePage {
  /** Bytes its parse makes. */
  bytes: number;
  /** Slices its load takes. */
  slices: number;
}

/** A runtime of pages; a page parses `bytes` over `slices` slices. */
function createFakeRuntime(pages: Record<number, FakePage>) {
  let nextPtr = 100n;
  const open = new Map<Ptr, { objectNumber: number; slicesLeft: number; current: boolean }>();
  const memory = new DataView(new ArrayBuffer(4096));
  let nextScratch = 8;
  const calls = {
    /** Loads and closes, in order. */
    events: [] as string[],
    loads: [] as number[],
    starts: [] as number[],
    continues: [] as number[],
    closes: [] as number[],
    resets: [] as number[],
  };
  const newPage = (objectNumber: number, slicesLeft: number) => {
    const ptr = nextPtr++ as Ptr;
    open.set(ptr, { objectNumber, slicesLeft, current: true });
    return ptr;
  };
  const fn: Record<string, unknown> = {
    EPDFDoc_LoadPageByObjectNumberNormalized: (_doc: Ptr, objectNumber: number) => {
      calls.loads.push(objectNumber);
      calls.events.push(`load ${objectNumber}`);
      return pages[objectNumber] ? newPage(objectNumber, 0) : 0n;
    },
    EPDFDoc_StartLoadPageByObjectNumber: (_doc: Ptr, objectNumber: number) => {
      calls.starts.push(objectNumber);
      calls.events.push(`start ${objectNumber}`);
      return pages[objectNumber] ? newPage(objectNumber, pages[objectNumber].slices) : 0n;
    },
    EPDFPage_ContinueLoad: (ptr: Ptr, budgetMs: number) => {
      const page = open.get(ptr)!;
      calls.continues.push(page.objectNumber);
      page.slicesLeft = budgetMs > 1000 ? 0 : Math.max(0, page.slicesLeft - 1);
      return page.slicesLeft === 0 ? 1 : 0;
    },
    EPDFPage_GetParsedSize: (ptr: Ptr, out: Ptr) => {
      const page = open.get(ptr)!;
      const { bytes, slices } = pages[page.objectNumber];
      const parsed =
        slices === 0 ? bytes : Math.round((bytes * (slices - page.slicesLeft)) / slices);
      memory.setUint32(Number(out) + 24, parsed % 0x100000000, true);
      memory.setUint32(Number(out) + 28, Math.floor(parsed / 0x100000000), true);
      return 1;
    },
    EPDFPage_IsContentCurrent: (ptr: Ptr) => open.get(ptr)!.current,
    EPDFPage_ResetRenderCache: (ptr: Ptr) => {
      calls.resets.push(open.get(ptr)!.objectNumber);
      return 1;
    },
    FPDF_ClosePage: (ptr: Ptr) => {
      calls.closes.push(open.get(ptr)!.objectNumber);
      calls.events.push(`close ${open.get(ptr)!.objectNumber}`);
      open.delete(ptr);
    },
  };
  const mem = {
    alloc: (bytes: number) => {
      const ptr = BigInt(nextScratch) as Ptr;
      nextScratch += bytes;
      return ptr;
    },
    free: () => {},
    peek: (ptr: Ptr, _kind: string, offset = 0) => memory.getInt32(Number(ptr) + offset, true),
  };
  /** Marks every open page of `objectNumber` as no longer matching its document. */
  const changeContent = (objectNumber: number) => {
    for (const page of open.values()) {
      if (page.objectNumber === objectNumber) page.current = false;
    }
  };
  return {
    runtime: { fn, mem } as unknown as PdfRuntimeModule,
    calls,
    changeContent,
    openPages: () => [...open.values()].map((page) => page.objectNumber).sort(),
  };
}

const slices = { budgetMs: 8, between: () => Promise.resolve() };

/** Acquires and releases a page, as one job's reader does. */
function use(pool: PagePtrPool, objectNumber: number): void {
  pool.acquire(pon(objectNumber));
  pool.release(pon(objectNumber));
}

/** A page a view shows, as the worker hears it. */
function shown(page: number, role: 'visible' | 'near', pixels = 0) {
  return { pageObjectNumber: pon(page), role, pixels };
}

describe('PageResidency', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  test('keeps a released page and hands it back without loading it again', () => {
    const { runtime, calls } = createFakeRuntime({ 1: { bytes: MB, slices: 3 } });
    const residency = new PageResidency(runtime, { budgetBytes: 10 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    use(pool, 1);
    use(pool, 1);

    expect(calls.loads).toEqual([1]);
    expect(calls.closes).toEqual([]);
    expect(calls.resets).toEqual([1, 1]);
    expect(residency.bytes).toBe(MB + PAGE_OVERHEAD_BYTES);
  });

  test('closes the least recently used pages to stay within its budget', () => {
    const { runtime, calls } = createFakeRuntime({
      1: { bytes: 4 * MB, slices: 1 },
      2: { bytes: 4 * MB, slices: 1 },
      3: { bytes: 4 * MB, slices: 1 },
    });
    const residency = new PageResidency(runtime, { budgetBytes: 9 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    use(pool, 1);
    use(pool, 2);
    use(pool, 1); // 2 is now the least recently used.
    use(pool, 3);

    expect(calls.loads).toEqual([1, 2, 3]);
    expect(calls.closes).toEqual([2]);
    expect(residency.size).toBe(2);
    expect(residency.bytes).toBeLessThanOrEqual(9 * MB);
  });

  test('never closes a page a job holds, so one page may be over the budget alone', () => {
    const { runtime, calls } = createFakeRuntime({
      1: { bytes: 2 * MB, slices: 1 },
      2: { bytes: 20 * MB, slices: 1 },
    });
    const residency = new PageResidency(runtime, { budgetBytes: 10 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    pool.acquire(pon(1));
    pool.acquire(pon(2));
    expect(calls.closes).toEqual([]);
    expect(pool.isHeld(pon(1))).toBe(true);

    pool.release(pon(1));
    expect(calls.closes).toEqual([1]);
    pool.release(pon(2));
    // The big page stays: it is the one room was made for, and nothing else is kept.
    expect(calls.closes).toEqual([1, 2]);
    expect(residency.size).toBe(0);
  });

  test('makes room before a load for the size the page had when it was last open', () => {
    const { runtime, calls } = createFakeRuntime({
      1: { bytes: 6 * MB, slices: 1 },
      2: { bytes: 3 * MB, slices: 1 },
    });
    const residency = new PageResidency(runtime, { budgetBytes: 8 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    use(pool, 1);
    residency.closeIdle();
    use(pool, 2);
    calls.events.length = 0;

    // Page 1 needs 6 MB again, which doesn't fit beside page 2: page 2 closes
    // before page 1 loads, not after.
    use(pool, 1);
    expect(calls.events).toEqual(['close 2', 'load 1']);
  });

  test('loads a page in slices, and sets an aborted load aside for the next job', async () => {
    const { runtime, calls } = createFakeRuntime({ 1: { bytes: 4 * MB, slices: 5 } });
    const residency = new PageResidency(runtime, { budgetBytes: 100 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    const controller = new AbortController();
    let between = 0;
    const abortAfterTwo = {
      budgetMs: 8,
      between: async () => {
        if (++between === 2) controller.abort();
      },
    };
    await expect(pool.acquireInSlices(pon(1), controller.signal, abortAfterTwo)).rejects.toThrow();
    expect(calls.starts).toEqual([1]);
    expect(calls.continues).toEqual([1, 1]);
    expect(pool.isHeld(pon(1))).toBe(false);
    expect(residency.size).toBe(1);
    // A page half loaded has drawn nothing: its image cache is left alone.
    expect(calls.resets).toEqual([]);

    // The next job goes on with the same load.
    await pool.acquireInSlices(pon(1), new AbortController().signal, slices);
    expect(calls.starts).toEqual([1]);
    expect(calls.continues).toEqual([1, 1, 1, 1, 1]);
    expect(calls.closes).toEqual([]);
    pool.release(pon(1));
    expect(residency.bytes).toBe(4 * MB + PAGE_OVERHEAD_BYTES);
  });

  test('finishes a half loaded page in one go for a job that needs it at once', async () => {
    const { runtime, calls } = createFakeRuntime({ 1: { bytes: 4 * MB, slices: 5 } });
    const residency = new PageResidency(runtime, { budgetBytes: 100 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    const controller = new AbortController();
    const abortAfterOne = { budgetMs: 8, between: async () => controller.abort() };
    await expect(pool.acquireInSlices(pon(1), controller.signal, abortAfterOne)).rejects.toThrow();
    expect(calls.continues).toEqual([1]);

    use(pool, 1);
    expect(calls.loads).toEqual([]);
    expect(calls.starts).toEqual([1]);
    // One more call, with a budget that finishes the load.
    expect(calls.continues).toEqual([1, 1]);
    expect(residency.bytes).toBe(4 * MB + PAGE_OVERHEAD_BYTES);
  });

  test('makes room during a load as the page grows', async () => {
    const { runtime, calls } = createFakeRuntime({
      1: { bytes: 6 * MB, slices: 1 },
      2: { bytes: 8 * MB, slices: 4 },
    });
    const residency = new PageResidency(runtime, { budgetBytes: 10 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    use(pool, 1);
    let closedAtSlice = -1;
    let slice = 0;
    await pool.acquireInSlices(pon(2), new AbortController().signal, {
      budgetMs: 8,
      between: async () => {
        slice++;
        if (closedAtSlice < 0 && calls.closes.includes(1)) closedAtSlice = slice;
      },
    });
    // Page 1 stayed until page 2 had grown past what fits beside it.
    expect(closedAtSlice).toBeGreaterThan(1);
    pool.release(pon(2));
    expect(residency.size).toBe(1);
  });

  test('closes a page whose content changed when it is next taken, and loads it again', () => {
    const { runtime, calls, changeContent } = createFakeRuntime({ 1: { bytes: MB, slices: 1 } });
    const residency = new PageResidency(runtime, { budgetBytes: 100 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);

    use(pool, 1);
    changeContent(1);
    use(pool, 1);

    expect(calls.loads).toEqual([1, 1]);
    expect(calls.closes).toEqual([1]);
  });

  test('closes the idle pages of one document, or every page of a closing one', () => {
    const { runtime, openPages } = createFakeRuntime({
      1: { bytes: MB, slices: 1 },
      2: { bytes: MB, slices: 1 },
    });
    const residency = new PageResidency(runtime, { budgetBytes: 100 * MB, idleMs: 0 });
    const first = new PagePtrPool(runtime, DOC, residency);
    const second = new PagePtrPool(runtime, DOC, residency);

    use(first, 1);
    first.acquire(pon(2));
    use(second, 1);
    expect(openPages()).toEqual([1, 1, 2]);

    first.closeIdle();
    // The page a job holds stays, and so do the other document's.
    expect(openPages()).toEqual([1, 2]);
    expect(first.isHeld(pon(2))).toBe(true);

    first.closeAll();
    expect(openPages()).toEqual([1]);
    second.closeAll();
    expect(openPages()).toEqual([]);
  });

  test('closes pages no job uses once they have been idle a while', () => {
    vi.useFakeTimers();
    const { runtime, calls } = createFakeRuntime({ 1: { bytes: MB, slices: 1 } });
    let busy = false;
    const residency = new PageResidency(
      runtime,
      { budgetBytes: 100 * MB, idleMs: 1000 },
      () => busy,
    );
    const pool = new PagePtrPool(runtime, DOC, residency);

    use(pool, 1);
    busy = true;
    vi.advanceTimersByTime(1000);
    expect(calls.closes).toEqual([]);
    busy = false;
    vi.advanceTimersByTime(1000);
    expect(calls.closes).toEqual([1]);
  });

  test('closes pages no view shows first, then near ones, then visible ones from the fewest pixels up', () => {
    const { runtime, calls } = createFakeRuntime(
      Object.fromEntries([1, 2, 3, 4, 5, 6, 7].map((page) => [page, { bytes: 4 * MB, slices: 1 }])),
    );
    // Three pages fit.
    const residency = new PageResidency(runtime, { budgetBytes: 13 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);
    pool.setWorkingSet('stage', [
      shown(1, 'visible', 1_000_000),
      shown(2, 'visible', 30_000),
      shown(7, 'visible', 500_000),
      shown(3, 'near'),
    ]);

    for (const page of [1, 2, 4]) use(pool, page);
    use(pool, 3); // room for it: 4, in no set, goes before 2, visible and older
    expect(calls.closes).toEqual([4]);
    use(pool, 7); // 3, near, goes before 2, visible and older
    expect(calls.closes).toEqual([4, 3]);
    use(pool, 5); // 2 shows the fewest pixels; 1, older, shows the most
    expect(calls.closes).toEqual([4, 3, 2]);
    use(pool, 6); // 5, in no set
    expect(calls.closes).toEqual([4, 3, 2, 5]);
    use(pool, 3); // 6, in no set
    use(pool, 2); // 3, near, before 7, visible
    expect(calls.closes).toEqual([4, 3, 2, 5, 6, 3]);
    expect(pool.isKept(pon(1))).toBe(true);
  });

  test('only a page a job holds keeps the total over the budget: a visible page closes at its release', () => {
    const { runtime, calls } = createFakeRuntime({
      1: { bytes: 4 * MB, slices: 1 },
      2: { bytes: 4 * MB, slices: 1 },
      3: { bytes: 4 * MB, slices: 1 },
    });
    const residency = new PageResidency(runtime, { budgetBytes: 9 * MB, idleMs: 0 });
    const pool = new PagePtrPool(runtime, DOC, residency);
    pool.setWorkingSet('stage', [shown(1, 'visible', 1_000_000)]);

    // Three jobs hold three pages at once: over the budget, as held pages may be.
    for (const page of [1, 2, 3]) pool.acquire(pon(page));
    pool.release(pon(1));
    expect(calls.closes).toEqual([1]); // the only page no job holds
    pool.release(pon(2));
    pool.release(pon(3));
    expect(calls.closes).toEqual([1]); // within the budget again
  });

  test("the idle timer spares what a view shows on screen; a page keeps its best place; a set replaces the view's last one", () => {
    vi.useFakeTimers();
    const { runtime, calls } = createFakeRuntime(
      Object.fromEntries([1, 2, 3, 4].map((page) => [page, { bytes: MB, slices: 1 }])),
    );
    const residency = new PageResidency(runtime, { budgetBytes: 100 * MB, idleMs: 1000 });
    const pool = new PagePtrPool(runtime, DOC, residency);
    pool.setWorkingSet('stage', [shown(1, 'visible', 1_000_000), shown(3, 'visible', 200_000)]);
    // Another view shows page 2, and has page 3 near.
    pool.setWorkingSet('rail', [shown(2, 'visible', 30_000), shown(3, 'near')]);
    for (const page of [1, 2, 3, 4]) use(pool, page);

    vi.advanceTimersByTime(1000);
    expect(calls.closes).toEqual([4]); // in no set; 3 is visible in one view
    pool.setWorkingSet('stage', [shown(1, 'visible', 1_000_000)]);
    vi.advanceTimersByTime(1000);
    expect(calls.closes).toEqual([4, 3]); // only near now
    pool.setWorkingSet('rail', []); // the rail withdraws
    vi.advanceTimersByTime(1000);
    expect(calls.closes).toEqual([4, 3, 2]);
    expect(pool.isKept(pon(1))).toBe(true);
  });

  test('a session without a residency keeps nothing', () => {
    const { runtime, calls } = createFakeRuntime({ 1: { bytes: MB, slices: 1 } });
    const pool = new PagePtrPool(runtime, DOC);

    use(pool, 1);
    use(pool, 1);
    expect(calls.loads).toEqual([1, 1]);
    expect(calls.closes).toEqual([1, 1]);
  });
});
