import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, unlink } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import type { ObjectStoreWithInfo } from './ObjectStore';

/**
 * Disk-budget LRU + refcount cache of materialised base PDFs.
 *
 * Worker hosts call `acquire(sha)`; the cache:
 *   1. Returns a refcounted handle if the file is already on disk.
 *   2. Otherwise materialises it from the configured `ObjectStore`
 *      via `materializeLocal`, atomically (write to `.partial`,
 *      rename), and bumps the refcount to 1.
 *   3. Concurrent acquirers for the same sha share **one**
 *      materialise (singleflight) — no duplicated network traffic
 *      and no half-written file races.
 *
 * LRU eviction sweeps entries with `refcount === 0` from oldest to
 * newest until `usedBytes <= maxBytes`. Refcounted entries are
 * pinned and never evicted; over-budget cache state is acceptable
 * for the duration of an active handle. The acceptance criterion is
 * "second open of 1GB PDF ~microseconds" — that requires the file
 * to stay on disk + in OS page cache between calls.
 *
 * On boot, `sweepPartials()` removes any `.partial` files left
 * behind by a crash mid-materialise.
 */
export interface BaseFileCacheOptions {
  /** Absolute path under which materialised files live. */
  root: string;
  /** Soft cap. Eviction triggered when this is exceeded. */
  maxBytes: number;
  /** Object store the cache pulls from. */
  store: ObjectStoreWithInfo;
  /**
   * Verbose telemetry hook for tests + production logs. Counts each
   * hit / miss / evict so the calling app can wire to its metrics.
   */
  onEvent?: (event: BaseFileCacheEvent) => void;
}

export type BaseFileCacheEvent =
  | { kind: 'hit'; sha: string }
  | { kind: 'miss'; sha: string }
  | { kind: 'materialize-start'; sha: string; key: string }
  | { kind: 'materialize-end'; sha: string; ms: number; size: number }
  | { kind: 'materialize-error'; sha: string; error: string }
  | { kind: 'evict'; sha: string; size: number }
  | { kind: 'release'; sha: string; refcount: number }
  | { kind: 'sweep-partial'; path: string };

export interface LocalFileHandle {
  /** Absolute path PDFium can pread(). */
  readonly path: string;
  readonly size: number;
  readonly sha256: string;
  /**
   * Decrement the refcount. After the last `release()` the file is
   * eligible for LRU eviction; before then it's pinned to disk.
   *
   * Calling release more than once is a no-op + emits no event;
   * we tolerate the redundant call so route teardown code can
   * unconditionally release in a finally block.
   */
  release(): void;
}

interface CacheEntry {
  sha: string;
  path: string;
  size: number;
  refcount: number;
  /** Order tracker — incremented on every access, used for LRU. */
  lastUsed: number;
  /**
   * When non-null, an in-flight materialise. Concurrent `acquire()`
   * callers await this promise instead of starting a parallel fetch
   * (singleflight).
   */
  pending: Promise<CacheEntry> | null;
}

export class BaseFileCache {
  private readonly root: string;
  private readonly maxBytes: number;
  private readonly store: ObjectStoreWithInfo;
  private readonly onEvent: ((e: BaseFileCacheEvent) => void) | undefined;
  private readonly entries = new Map<string, CacheEntry>();
  private accessTick = 0;
  private usedBytes = 0;
  private destroyed = false;

  constructor(opts: BaseFileCacheOptions) {
    this.root = resolve(opts.root);
    this.maxBytes = opts.maxBytes;
    this.store = opts.store;
    this.onEvent = opts.onEvent;
  }

  /**
   * Boot-time: scan `root` and remove any `*.partial.*` files left
   * by a crashed materialise. Safe to call on a non-existent root.
   * Returns the number of files removed.
   */
  async sweepPartials(): Promise<number> {
    let count = 0;
    await mkdir(this.root, { recursive: true });
    const walk = async (dir: string): Promise<void> => {
      let entries;
      try {
        entries = await readdir(dir, { withFileTypes: true });
      } catch (err) {
        if ((err as { code?: string } | null)?.code === 'ENOENT') return;
        throw err;
      }
      for (const e of entries) {
        const abs = join(dir, e.name);
        if (e.isDirectory()) {
          await walk(abs);
          continue;
        }
        if (e.isFile() && /\.partial(\.|$)/.test(e.name)) {
          await unlink(abs).catch(() => {});
          this.onEvent?.({ kind: 'sweep-partial', path: abs });
          count++;
        }
      }
    };
    await walk(this.root);
    return count;
  }

  /**
   * Acquire a handle to a materialised file. Refcount is incremented
   * on the returned handle; the caller MUST call `handle.release()`
   * exactly once. Singleflight: concurrent acquires of the same sha
   * share one materialise.
   *
   * The `key` argument is the storage-side location (eg
   * `<tenant>/docs/<cd>/<docId>/base.pdf`). The cache identity is the
   * sha — same sha across two docs maps to **one** local file, so
   * the "same employee handbook for 1000 employees" case materialises
   * once per worker host.
   */
  async acquire(opts: {
    sha: string;
    key: string;
    signal?: AbortSignal;
  }): Promise<LocalFileHandle> {
    if (this.destroyed) throw new Error('BaseFileCache: destroyed');
    const sha = opts.sha;
    if (!/^[0-9a-f]{64}$/.test(sha)) {
      throw new Error(`BaseFileCache.acquire: invalid sha256 hex ${sha}`);
    }

    let entry = this.entries.get(sha);
    if (entry && !entry.pending) {
      // Hot path: file is on disk, just bump refcount + touch LRU.
      entry.refcount++;
      entry.lastUsed = ++this.accessTick;
      this.onEvent?.({ kind: 'hit', sha });
      return this.handle(entry);
    }

    if (entry?.pending) {
      // Singleflight: another caller is materialising; await the
      // same promise, then bump the refcount the same way.
      this.onEvent?.({ kind: 'hit', sha });
      const settled = await entry.pending;
      settled.refcount++;
      settled.lastUsed = ++this.accessTick;
      return this.handle(settled);
    }

    // Miss → materialise. Create a placeholder entry with a `pending`
    // promise so racers join the singleflight immediately.
    this.onEvent?.({ kind: 'miss', sha });
    const path = this.pathFor(sha);
    entry = {
      sha,
      path,
      size: 0,
      refcount: 1,
      lastUsed: ++this.accessTick,
      pending: null,
    };
    this.entries.set(sha, entry);
    const promise = this.materialize(entry, opts.key, opts.signal);
    entry.pending = promise;
    try {
      const settled = await promise;
      return this.handle(settled);
    } catch (err) {
      // The materialise failed; the entry was already removed by
      // `materialize` on its error path. Propagate.
      throw err;
    }
  }

  private async materialize(
    entry: CacheEntry,
    storageKey: string,
    signal?: AbortSignal,
  ): Promise<CacheEntry> {
    const started = Date.now();
    this.onEvent?.({ kind: 'materialize-start', sha: entry.sha, key: storageKey });
    try {
      const result = await this.store.materializeLocal(storageKey, entry.path, {
        expectedSha: entry.sha,
        signal,
      });
      entry.size = result.size;
      entry.path = result.path;
      entry.pending = null;
      this.usedBytes += result.size;
      const ms = Date.now() - started;
      this.onEvent?.({ kind: 'materialize-end', sha: entry.sha, ms, size: result.size });
      // Lazy LRU sweep — only when we exceed the budget. Refcount=1
      // entries are pinned, so this can no-op when the only thing
      // over-budget is the freshly-materialised file.
      this.evictIfOverBudget();
      return entry;
    } catch (err) {
      this.onEvent?.({
        kind: 'materialize-error',
        sha: entry.sha,
        error: err instanceof Error ? err.message : String(err),
      });
      // Roll back the optimistic insertion so a retry can succeed.
      this.entries.delete(entry.sha);
      throw err;
    }
  }

  private handle(entry: CacheEntry): LocalFileHandle {
    let released = false;
    const onRelease = () => {
      if (released) return;
      released = true;
      entry.refcount = Math.max(0, entry.refcount - 1);
      this.onEvent?.({ kind: 'release', sha: entry.sha, refcount: entry.refcount });
      if (entry.refcount === 0) this.evictIfOverBudget();
    };
    return {
      path: entry.path,
      size: entry.size,
      sha256: entry.sha,
      release: onRelease,
    };
  }

  private evictIfOverBudget(): void {
    if (this.usedBytes <= this.maxBytes) return;
    // Order entries by lastUsed ascending; pick refcount=0 ones to
    // evict until we're under budget or run out of candidates.
    const ordered = [...this.entries.values()]
      .filter((e) => e.refcount === 0 && !e.pending)
      .sort((a, b) => a.lastUsed - b.lastUsed);
    for (const e of ordered) {
      if (this.usedBytes <= this.maxBytes) break;
      this.entries.delete(e.sha);
      this.usedBytes -= e.size;
      this.onEvent?.({ kind: 'evict', sha: e.sha, size: e.size });
      // Schedule unlink async; failure to remove the file from disk
      // is recoverable (next boot's sweep handles orphans).
      void unlink(e.path).catch(() => {});
    }
  }

  private pathFor(sha: string): string {
    return join(this.root, sha.slice(0, 2), `${sha}.pdf`);
  }

  /** Diagnostic snapshot. */
  stats(): { entries: number; usedBytes: number; refcounted: number } {
    let refcounted = 0;
    for (const e of this.entries.values()) if (e.refcount > 0) refcounted++;
    return { entries: this.entries.size, usedBytes: this.usedBytes, refcounted };
  }

  /**
   * Best-effort teardown. Waits up to `gracePeriodMs` for refcounted
   * entries to drain, then deletes everything. Tests use this; in
   * production the cache outlives the request lifecycle of the
   * Fastify app.
   */
  async destroy(opts: { gracePeriodMs?: number } = {}): Promise<void> {
    if (this.destroyed) return;
    this.destroyed = true;
    const deadline = Date.now() + (opts.gracePeriodMs ?? 0);
    while (Date.now() < deadline) {
      const pinned = [...this.entries.values()].some((e) => e.refcount > 0);
      if (!pinned) break;
      await delay(20);
    }
    for (const e of this.entries.values()) {
      await unlink(e.path).catch(() => {});
    }
    this.entries.clear();
    this.usedBytes = 0;
  }

  /**
   * Used by tests — verify the cache returns the expected on-disk
   * size for a file. Cheap re-stat against the entry's path.
   */
  async _statForTest(sha: string): Promise<{ exists: boolean; size: number }> {
    const e = this.entries.get(sha);
    if (!e) return { exists: false, size: 0 };
    try {
      const s = await stat(e.path);
      return { exists: true, size: s.size };
    } catch {
      return { exists: false, size: 0 };
    }
  }
}

/**
 * Convenience: stream-hash a file in 64KB chunks. Used outside the
 * cache (eg by services that want to sanity-check materialised
 * bytes without re-reading them in full).
 */
export async function fileSha256(path: string): Promise<string> {
  const { createHash } = await import('node:crypto');
  const h = createHash('sha256');
  for await (const chunk of createReadStream(path)) {
    h.update(chunk as Buffer);
  }
  return h.digest('hex');
}
