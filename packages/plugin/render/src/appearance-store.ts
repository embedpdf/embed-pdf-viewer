import type { AnnotationAppearanceImage, PageObjectNumber } from '@embedpdf/core';

type Pictures = readonly AnnotationAppearanceImage[];

/**
 * The pictures of each page's form fields, shared between the views that
 * paint them: asks for one page, scale and version (one key) share one
 * fetch, and the last pictures of each page are kept, so a page shown again
 * unchanged needs no fetch. A newer key of a page replaces the kept one
 * once it arrives.
 *
 * Consumer aborts are refcounted, as in the raster store: a view that leaves
 * detaches without stopping the fetch for the others; the fetch stops only
 * when the last one leaves before it resolved.
 */
export class AppearanceStore {
  private readonly entries = new Map<string, Entry>();
  /** The key of the resolved pictures kept for each page. */
  private readonly kept = new Map<PageObjectNumber, string>();

  acquire(
    pageObjectNumber: PageObjectNumber,
    key: string,
    fetch: (signal: AbortSignal) => Promise<Pictures>,
    signal?: AbortSignal,
  ): Promise<Pictures> {
    const existing = this.entries.get(key);
    if (existing) return this.attach(key, existing, signal);

    const entry: Entry = {
      pageObjectNumber,
      promise: undefined as unknown as Promise<Pictures>,
      refs: 0,
      abort: new AbortController(),
      resolved: false,
    };
    entry.promise = fetch(entry.abort.signal).then(
      (pictures) => {
        entry.resolved = true;
        this.keep(pageObjectNumber, key);
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

  /** Keep `key` as the page's pictures, letting go of the ones it replaces. */
  private keep(pageObjectNumber: PageObjectNumber, key: string): void {
    const previous = this.kept.get(pageObjectNumber);
    this.kept.set(pageObjectNumber, key);
    if (previous === undefined || previous === key) return;
    const entry = this.entries.get(previous);
    if (entry && entry.refs <= 0) this.entries.delete(previous);
  }

  private attach(key: string, entry: Entry, signal?: AbortSignal): Promise<Pictures> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    entry.refs += 1;
    if (!signal) {
      const release = () => this.release(key, entry);
      entry.promise.then(release, release);
      return entry.promise;
    }
    let settled = false;
    return new Promise<Pictures>((resolve, reject) => {
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

  /** A consumer let go: pictures a newer key of their page replaced go with the last one. */
  private release(key: string, entry: Entry): void {
    entry.refs -= 1;
    if (entry.refs <= 0 && entry.resolved && this.kept.get(entry.pageObjectNumber) !== key) {
      this.drop(key, entry);
    }
  }

  private drop(key: string, entry: Entry): void {
    if (this.entries.get(key) === entry) this.entries.delete(key);
  }
}

interface Entry {
  pageObjectNumber: PageObjectNumber;
  promise: Promise<Pictures>;
  refs: number;
  abort: AbortController;
  resolved: boolean;
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('aborted', 'AbortError');
}
