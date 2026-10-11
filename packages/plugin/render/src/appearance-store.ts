/**
 * The engine's pictures of a page's annotations or form widgets, shared
 * between the views and plugins that draw them. One ask is one key (the
 * page, the family, the scale and the owner's items at their versions):
 * asks with the same key share one fetch.
 *
 * Consumer aborts are refcounted, as in the raster store: a view that leaves
 * detaches without stopping the fetch for the others; the fetch stops only
 * when the last one leaves before it resolved.
 *
 * Kept for undo:
 * - the last {@link SETS_KEPT} sets of each page and family: an undo that
 *   brings a page back to an earlier set asks the engine for nothing;
 * - each item's last pictures ({@link RecentPictures}), a while after it left
 *   its page: an undo that brings it back shows them at once.
 */
export class AppearanceStore<Picture> {
  private readonly entries = new Map<string, Entry<Picture>>();
  /** The keys of the resolved sets kept for each page and family, newest last. */
  private readonly kept = new Map<string, string[]>();

  /** `group` names the page and family; `key` the whole ask. */
  acquire(
    group: string,
    key: string,
    fetch: (signal: AbortSignal) => Promise<readonly Picture[]>,
    signal?: AbortSignal,
  ): Promise<readonly Picture[]> {
    const existing = this.entries.get(key);
    if (existing) {
      if (existing.resolved) this.keep(group, key);
      return this.attach(key, existing, signal);
    }

    const entry: Entry<Picture> = {
      group,
      promise: undefined as unknown as Promise<readonly Picture[]>,
      refs: 0,
      abort: new AbortController(),
      resolved: false,
    };
    entry.promise = fetch(entry.abort.signal).then(
      (pictures) => {
        entry.resolved = true;
        this.keep(group, key);
        return pictures;
      },
      (error) => {
        // A failed fetch isn't kept: the next ask tries again.
        this.drop(key, entry);
        throw error;
      },
    );
    // Each consumer sees the rejection through its own attachment.
    entry.promise.catch(() => {});
    this.entries.set(key, entry);
    return this.attach(key, entry, signal);
  }

  /** Keep `key` as the group's newest set, letting go of the oldest beyond the few kept. */
  private keep(group: string, key: string): void {
    const kept = (this.kept.get(group) ?? []).filter((each) => each !== key);
    kept.push(key);
    const gone = kept.splice(0, Math.max(0, kept.length - SETS_KEPT));
    this.kept.set(group, kept);
    for (const old of gone) {
      const entry = this.entries.get(old);
      if (entry && entry.refs <= 0) this.entries.delete(old);
    }
  }

  private isKept(group: string, key: string): boolean {
    return this.kept.get(group)?.includes(key) ?? false;
  }

  private attach(
    key: string,
    entry: Entry<Picture>,
    signal?: AbortSignal,
  ): Promise<readonly Picture[]> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    entry.refs += 1;
    if (!signal) {
      const release = () => this.release(key, entry);
      entry.promise.then(release, release);
      return entry.promise;
    }
    let settled = false;
    return new Promise<readonly Picture[]>((resolve, reject) => {
      const onAbort = () => {
        if (settled) return;
        settled = true;
        entry.refs -= 1;
        if (entry.refs <= 0 && !entry.resolved) {
          entry.abort.abort(abortReason(signal));
          this.drop(key, entry);
        }
        reject(abortReason(signal));
      };
      signal.addEventListener('abort', onAbort, { once: true });
      entry.promise.then(
        (pictures) => {
          if (settled) return;
          settled = true;
          this.release(key, entry);
          signal.removeEventListener('abort', onAbort);
          resolve(pictures);
        },
        (error) => {
          if (settled) return;
          settled = true;
          this.release(key, entry);
          signal.removeEventListener('abort', onAbort);
          reject(error);
        },
      );
    });
  }

  /** A consumer let go: a set no longer kept goes with the last one. */
  private release(key: string, entry: Entry<Picture>): void {
    entry.refs -= 1;
    if (entry.refs <= 0 && entry.resolved && !this.isKept(entry.group, key)) {
      this.drop(key, entry);
    }
  }

  private drop(key: string, entry: Entry<Picture>): void {
    if (this.entries.get(key) === entry) this.entries.delete(key);
  }
}

/** How many of each page's latest sets are kept, per family: an undo goes back to one. */
export const SETS_KEPT = 4;

/** How many items' last pictures are kept, per family, for an undo that brings one back. */
export const ITEMS_KEPT = 200;

/**
 * The last pictures of each item (all its states), the newest {@link ITEMS_KEPT}
 * items per family, kept after the item left its page.
 */
export class RecentPictures<Picture> {
  private readonly families = new Map<string, Map<string, readonly Picture[]>>();

  /** A fetch's pictures, grouped by item: each replaces what its item had. */
  remember(family: string, pictures: readonly Picture[], keyOf: (picture: Picture) => string) {
    const items = this.families.get(family) ?? new Map<string, readonly Picture[]>();
    const byItem = new Map<string, Picture[]>();
    for (const picture of pictures) {
      const key = keyOf(picture);
      byItem.set(key, [...(byItem.get(key) ?? []), picture]);
    }
    for (const [key, itemPictures] of byItem) {
      items.delete(key);
      items.set(key, itemPictures);
    }
    while (items.size > ITEMS_KEPT) items.delete(items.keys().next().value!);
    this.families.set(family, items);
  }

  of(family: string, key: string): readonly Picture[] {
    return this.families.get(family)?.get(key) ?? [];
  }
}

interface Entry<Picture> {
  group: string;
  promise: Promise<readonly Picture[]>;
  refs: number;
  abort: AbortController;
  resolved: boolean;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('aborted', 'AbortError');
}
