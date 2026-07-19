/**
 * Max-heap with O(log n) insert, pop, and remove-by-handle.
 *
 * Insert returns a `HeapHandle` whose .index is kept in sync with the
 * element's location in the heap as items move during sift up/down.
 * That makes random removal cheap, which is what the WorkerQueue needs
 * when an in-flight AbortablePromise is aborted from outside the queue.
 *
 * Stable for equal priorities: items inserted earlier come out first.
 */

export interface HeapHandle {
  /** Mutable position in the underlying array. -1 once removed. */
  index: number;
}

interface HeapEntry<V> {
  value: V;
  priority: number;
  /** Insertion sequence number, used as a tiebreaker so the heap is stable. */
  seq: number;
  handle: HeapHandle;
}

export class IndexedPriorityHeap<V> {
  private readonly arr: HeapEntry<V>[] = [];
  private nextSeq = 0;

  get size(): number {
    return this.arr.length;
  }

  push(value: V, priority: number): HeapHandle {
    const handle: HeapHandle = { index: this.arr.length };
    const entry: HeapEntry<V> = { value, priority, seq: this.nextSeq++, handle };
    this.arr.push(entry);
    this.siftUp(handle.index);
    return handle;
  }

  /**
   * Remove and return the highest-priority value (highest priority wins;
   * ties break in FIFO order).
   */
  popMax(): V | undefined {
    if (this.arr.length === 0) return undefined;
    const top = this.arr[0]!;
    this.swapAndPop(0);
    top.handle.index = -1;
    return top.value;
  }

  remove(handle: HeapHandle): boolean {
    const i = handle.index;
    if (i < 0 || i >= this.arr.length) return false;
    handle.index = -1;
    if (i === this.arr.length - 1) {
      this.arr.pop();
      return true;
    }
    this.swapAndPop(i);
    return true;
  }

  private swapAndPop(i: number): void {
    const last = this.arr.pop()!;
    if (i < this.arr.length) {
      last.handle.index = i;
      this.arr[i] = last;
      // After replacement we may need to sift either way.
      const parent = this.parentOf(i);
      if (parent >= 0 && this.compare(i, parent) > 0) {
        this.siftUp(i);
      } else {
        this.siftDown(i);
      }
    }
  }

  private siftUp(i: number): void {
    while (i > 0) {
      const p = this.parentOf(i);
      if (this.compare(i, p) > 0) {
        this.swap(i, p);
        i = p;
      } else {
        return;
      }
    }
  }

  private siftDown(i: number): void {
    const n = this.arr.length;
    for (;;) {
      const l = i * 2 + 1;
      const r = l + 1;
      let best = i;
      if (l < n && this.compare(l, best) > 0) best = l;
      if (r < n && this.compare(r, best) > 0) best = r;
      if (best === i) return;
      this.swap(i, best);
      i = best;
    }
  }

  private parentOf(i: number): number {
    return ((i + 1) >> 1) - 1;
  }

  /** > 0 when a should be above b in the heap. */
  private compare(a: number, b: number): number {
    const ea = this.arr[a]!;
    const eb = this.arr[b]!;
    if (ea.priority !== eb.priority) return ea.priority - eb.priority;
    // FIFO tiebreaker: lower seq is "above" (popped first).
    return eb.seq - ea.seq;
  }

  private swap(i: number, j: number): void {
    const ai = this.arr[i]!;
    const aj = this.arr[j]!;
    this.arr[i] = aj;
    this.arr[j] = ai;
    ai.handle.index = j;
    aj.handle.index = i;
  }
}
