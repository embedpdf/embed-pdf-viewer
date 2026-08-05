import type { PageImageHandle } from '@embedpdf/core';

/**
 * Client-side mirror of the server's one-door read-through: per-key
 * SINGLEFLIGHT + LRU over encoded page images.
 *
 * The key is the raster's canonical identity (conformed viewport +
 * annotations flag + epoch — see `renderSourceKey`), so the lattice does the
 * caching work: every ask inside one rung is the same key, and rung
 * re-crossings (zoom 1280 → 2560 → back) resolve instantly from the LRU
 * instead of re-rendering. Epoch bumps mint new keys; stale-epoch entries
 * age out through the LRU (they are never re-requested).
 *
 * Consumer aborts are REFCOUNTED: a caller abandoning a fetch (camera moved,
 * layer unmounted) detaches without killing it for other consumers; the
 * underlying engine call aborts only when the LAST in-flight consumer leaves.
 * Resolved entries are kept (evictable by LRU) — an abort after resolution
 * is a no-op by design.
 */
export class RasterStore {
  private readonly entries = new Map<string, Entry>();
  private tick = 0;

  constructor(private readonly maxEntries = 48) {}

  acquire(
    key: string,
    fetch: (signal: AbortSignal) => Promise<PageImageHandle>,
    signal?: AbortSignal,
  ): Promise<PageImageHandle> {
    const existing = this.entries.get(key);
    if (existing) {
      existing.used = ++this.tick;
      return this.attach(key, existing, signal);
    }

    const abort = new AbortController();
    const entry: Entry = {
      promise: undefined as unknown as Promise<PageImageHandle>,
      refs: 0,
      abort,
      used: ++this.tick,
    };
    entry.promise = fetch(abort.signal).then(
      (handle) => {
        entry.handle = handle;
        return handle;
      },
      (err) => {
        // Failed fetches must not be sticky — drop so the next ask retries.
        if (this.entries.get(key) === entry) this.entries.delete(key);
        throw err;
      },
    );
    // Swallow the shared promise's rejection when no consumer is attached
    // (everyone aborted) — each consumer observes it via its own attachment.
    entry.promise.catch(() => {});
    this.entries.set(key, entry);
    this.evict();
    return this.attach(key, entry, signal);
  }

  /** Resolved handle if present — synchronous peek for paint-time reuse. */
  peek(key: string): PageImageHandle | undefined {
    const entry = this.entries.get(key);
    if (entry?.handle) entry.used = ++this.tick;
    return entry?.handle;
  }

  get size(): number {
    return this.entries.size;
  }

  private attach(key: string, entry: Entry, signal?: AbortSignal): Promise<PageImageHandle> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    // EVERY consumer holds a ref while the fetch is in flight — including
    // signal-less ones ("I never abandon"), otherwise a signal-bearing
    // sibling's abort could kill a fetch someone else is still awaiting.
    entry.refs += 1;
    if (!signal) {
      const release = () => {
        entry.refs -= 1;
      };
      entry.promise.then(release, release);
      return entry.promise;
    }
    let settled = false;
    return new Promise<PageImageHandle>((resolve, reject) => {
      const onAbort = () => {
        if (settled) return;
        settled = true;
        entry.refs -= 1;
        // Last live consumer walking away from an UNRESOLVED fetch kills it;
        // resolved entries stay for the LRU (that's the cache).
        if (entry.refs <= 0 && entry.handle === undefined) {
          entry.abort.abort(abortReason(signal));
          if (this.entries.get(key) === entry) this.entries.delete(key);
        }
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (handle) => {
          if (settled) return;
          settled = true;
          entry.refs -= 1;
          signal.removeEventListener('abort', onAbort);
          resolve(handle);
        },
        (err) => {
          if (settled) return;
          settled = true;
          entry.refs -= 1;
          signal.removeEventListener('abort', onAbort);
          reject(err);
        },
      );
    });
  }

  private evict(): void {
    if (this.entries.size <= this.maxEntries) return;
    // Oldest-first over evictable entries: resolved and consumer-free.
    const candidates = [...this.entries.entries()]
      .filter(([, e]) => e.refs <= 0 && e.handle !== undefined)
      .sort((a, b) => a[1].used - b[1].used);
    for (const [key] of candidates) {
      if (this.entries.size <= this.maxEntries) return;
      this.entries.delete(key);
    }
  }
}

interface Entry {
  promise: Promise<PageImageHandle>;
  handle?: PageImageHandle;
  refs: number;
  abort: AbortController;
  used: number;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('aborted', 'AbortError');
}
