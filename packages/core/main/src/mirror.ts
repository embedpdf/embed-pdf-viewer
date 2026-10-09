/**
 * Mirrors: local copies of data the engine owns, kept current from the
 * document event stream.
 *
 * A mirror changes in exactly two ways: a load (the whole value, or some
 * pages of it) and a fold (one confirmed event applied by a pure function).
 * Plugin verbs never write a mirror. Both engines publish the event for a
 * session's own mutation before the mutation's promise resolves, so a verb
 * that awaits its engine call already sees its own write in the mirror.
 *
 * What the user sees is `view()`: the mirror's value with this session's
 * pending changes (changes.ts) replayed on top, op by op, through the spec's
 * `predict`. An answered change leaves the view once the mirror holds the
 * answer: at once when its events folded, or, when a fold asked to read
 * again, once that read (or a later full load) lands.
 *
 * The load protocol:
 *   1. The mirror subscribes to the event stream when it is created.
 *   2. The first load starts once the plugin is connected.
 *   3. Events that arrive while a load runs are queued, then replayed after
 *      the loaded value lands, skipping events the snapshot already contains
 *      (`origin.serverId <= cursor`). Replaying confirmed records in arrival
 *      order is idempotent, so engines without a cursor replay everything.
 *   4. A failed load keeps the previous value, applies the queued events to
 *      it, and reports `error` (or `forbidden`) through `getStatus()`. So
 *      does a failed page reload: the value is stale for those pages until
 *      a full load succeeds.
 *   5. `stream.desynced` and `document.versioned` reload; `fold` never sees
 *      them. A `fold` that throws is reported and also reloads.
 *   6. A reload requested while one runs schedules exactly one more after it.
 *   7. The value lives in a leased store cell, revoked when the instance
 *      closes, so it is reactive and a closed instance cannot write it.
 */
import type { DocumentEvent, DocumentHandle, PageRef } from '@embedpdf/engine-core/runtime';
import type { ChangeViews, PredictedOp, QueuedChange } from './changes';
import { isPluginError } from './errors';
import type { SliceLease } from './store';
import type { ResourceStatus } from './types';

const RELOAD = Symbol('mirror.reload');

/** What `fold` returns when an event is too coarse to apply: reload everything, or some pages. */
export interface MirrorReload {
  readonly [RELOAD]: 'all' | readonly PageRef[];
}

/** Ask the mirror to reload instead of applying the event. */
export function reload(options?: { pages?: readonly PageRef[] }): MirrorReload {
  return { [RELOAD]: options?.pages ?? 'all' };
}

const isReload = (value: unknown): value is MirrorReload =>
  typeof value === 'object' && value !== null && RELOAD in value;

/** One applied change of a mirror, handed to the spec's `changed` callback. */
export interface MirrorChange<V> {
  /** `load` for loads and reloads, `event` for a folded event. */
  readonly cause: 'load' | 'event';
  /** The folded event; null for loads. */
  readonly event: DocumentEvent | null;
  /** For loads: every page (`'all'`) or the pages that were reloaded. Null for events. */
  readonly pages: 'all' | readonly PageRef[] | null;
  readonly previous: V;
  readonly next: V;
}

export interface MirrorSpec<V> {
  /** Unique within the plugin; names the store cell and appears in errors. */
  readonly name: string;
  /** The value before the first load lands. */
  readonly initial: () => V;
  /** False: status `forbidden` and no engine read. Asked before every load. */
  readonly readable?: () => boolean;
  /**
   * Read the whole value. `cursor` is the newest server event the snapshot
   * already contains (cloud engines); omit it when the engine has none.
   */
  load(doc: DocumentHandle, signal: AbortSignal): Promise<{ value: V; cursor?: number | null }>;
  /**
   * Apply one confirmed event. Pure, and the same for every origin. Return
   * `value` itself when the event does not apply, or `reload(...)` when the
   * event does not carry enough to apply.
   */
  fold(value: V, event: DocumentEvent): V | MirrorReload;
  /**
   * Apply one op of a change this session staged and the engine hasn't
   * answered, as the engine will: the same rules, and absolute, so an op the
   * value already holds changes nothing. Pure. Return `value` itself for an op
   * it doesn't concern. Without it, `view()` is `get()`.
   */
  predict?(value: V, op: PredictedOp): V;
  /**
   * Read some pages and return how to merge them into the value. Required
   * when `fold` asks for a page-scoped reload; without it such a request
   * reloads everything.
   */
  loadPages?(
    doc: DocumentHandle,
    pages: readonly PageRef[],
    signal: AbortSignal,
  ): Promise<(value: V) => V>;
  /**
   * Runs after every load (even one that changed nothing) and every event
   * that changed the value: the one place a plugin emits the events this
   * data drives.
   */
  readonly changed?: (change: MirrorChange<V>) => void;
}

export interface Mirror<V> {
  /** What the engine confirmed. */
  get(): V;
  /** What the user sees: `get()` with this session's pending changes on top (`predict`). */
  view(): V;
  /** `idle` until the first load starts; stays `ready` while a reload runs. */
  getStatus(): ResourceStatus;
  /** Reload everything. Joins a running load; rejects when the load fails. */
  refresh(): Promise<void>;
  /**
   * Resolves once no load or page reload is running, including reloads
   * started by events that arrive while it waits. Never rejects.
   */
  settled(): Promise<void>;
}

/** What the kernel hands a mirror: the instance's document, lifetime and store access. */
export interface MirrorEnvironment {
  readonly doc: DocumentHandle;
  readonly lifetime: AbortSignal;
  /** A store cell owned by this instance, revoked when it closes. */
  cell<T>(name: string, initial: T): SliceLease<T>;
  /** Subscribe to the document's confirmed events for the instance's lifetime. */
  onDocumentEvent(listener: (event: DocumentEvent) => void): void;
  /** The document's pending changes, which `view()` shows. */
  readonly changes: ChangeViews;
  /** Wake the store's readers: what `view()` shows changed outside a store write. */
  notify(): void;
  report(error: unknown): void;
}

interface MirrorCell<V> {
  readonly value: V;
  readonly status: ResourceStatus;
}

/** Events that invalidate every mirror: the stream skipped events, or the document moved to new bytes. */
export const isResync = (event: DocumentEvent): boolean =>
  event.type === 'stream.desynced' || event.type === 'document.versioned';

export const statusOfFailure = (error: unknown): ResourceStatus =>
  isPluginError(error, 'permission-denied') ? 'forbidden' : 'error';

/** The `opId` of the change an event belongs to, or null for an event of none. */
export const changeIdOf = (event: DocumentEvent): string | null =>
  'origin' in event ? (event.origin.tx?.id ?? null) : null;

/** The changes a view shows: the queue's, and the answered ones a mirror keeps, each once. */
export function showingWith(
  changes: ChangeViews,
  kept: Iterable<{ readonly change: QueuedChange }>,
): QueuedChange[] {
  const shown = new Map(changes.shown().map((change) => [change.opId, change]));
  for (const { change } of kept) shown.set(change.opId, change);
  return [...shown.values()];
}

/**
 * Replay changes over a value, in staging order: the shown ones and the
 * answered ones a mirror still shows. A `predict` that throws is reported,
 * and the value shows the truth.
 */
export function replay<V>(
  value: V,
  changes: readonly QueuedChange[],
  predict: (value: V, op: PredictedOp) => V,
  report: (error: unknown) => void,
): V {
  const ordered = [...changes].sort((left, right) => left.seq - right.seq);
  let next = value;
  try {
    for (const change of ordered) for (const op of change.shows) next = predict(next, op);
  } catch (error) {
    report(error);
    return value;
  }
  return next;
}

/** A mirror plus the kernel-side `start`, called once the plugin is connected. */
export interface MirrorController<V> {
  readonly mirror: Mirror<V>;
  start(): void;
}

export function createMirror<V>(spec: MirrorSpec<V>, env: MirrorEnvironment): MirrorController<V> {
  const cell = env.cell<MirrorCell<V>>(`mirror/${spec.name}`, {
    value: spec.initial(),
    status: 'idle',
  });
  let started = false;
  let running: Promise<void> | null = null;
  const pageReloads = new Set<Promise<void>>();
  let loadAgain = false;
  /** Non-null while a full load runs: the events to replay after it lands. */
  let queued: DocumentEvent[] | null = null;
  /** How many full loads have started: a load clears what was kept before it started. */
  let fullLoads = 0;

  /**
   * Changes this mirror still shows though the engine may have answered them: a
   * fold asked to read again, and the read hasn't landed. `after`: the full
   * loads started before; a later full load that lands holds the change too.
   */
  const kept = new Map<string, { change: QueuedChange; after: number }>();
  let keptVersion = 0;

  /** Keep the change an event belongs to until a read lands, when it's one of ours. */
  const keepUntilRead = (event: DocumentEvent, after: number): string | null => {
    const opId = changeIdOf(event);
    const change = opId !== null && spec.predict ? env.changes.find(opId) : undefined;
    if (!change) return null;
    kept.set(change.opId, { change, after });
    keptVersion += 1;
    return change.opId;
  };

  const release = (opIds: readonly string[]): void => {
    let any = false;
    for (const opId of opIds) any = kept.delete(opId) || any;
    if (!any) return;
    keptVersion += 1;
    env.notify();
  };

  const releaseLoadedBy = (load: number): void =>
    release([...kept].filter(([, entry]) => entry.after < load).map(([opId]) => opId));

  let viewMemo: { value: V; version: number; kept: number; view: V } | null = null;
  const view = (): V => {
    const value = cell.read().value;
    if (!spec.predict) return value;
    const version = env.changes.version();
    if (
      viewMemo &&
      viewMemo.value === value &&
      viewMemo.version === version &&
      viewMemo.kept === keptVersion
    ) {
      return viewMemo.view;
    }
    const next = replay(value, showingWith(env.changes, kept.values()), spec.predict, env.report);
    viewMemo = { value, version, kept: keptVersion, view: next };
    return next;
  };

  const announce = (change: MirrorChange<V>): void => {
    try {
      spec.changed?.(change);
    } catch (error) {
      env.report(error);
    }
  };

  const commit = (next: V, change: Omit<MirrorChange<V>, 'previous' | 'next'>): void => {
    const previous = cell.read().value;
    if (next === previous) return;
    if (!cell.write({ ...cell.read(), value: next })) return;
    announce({ ...change, previous, next });
  };

  const reloadInBackground = (): void => {
    void refresh().catch(() => {
      /* the failure is reported through getStatus() */
    });
  };

  const reloadPages = async (pages: readonly PageRef[], keptFor: string | null): Promise<void> => {
    try {
      const merge = await spec.loadPages!(env.doc, pages, env.lifetime);
      if (!cell.live) return;
      const previous = cell.read().value;
      const next = merge(previous);
      cell.write({ ...cell.read(), value: next });
      announce({ cause: 'load', event: null, pages, previous, next });
      if (keptFor !== null) release([keptFor]);
    } catch (error) {
      if (isPluginError(error, 'instance-closed') || !cell.live) return;
      // The value is stale for these pages: say so until a full load succeeds.
      cell.write({ ...cell.read(), status: statusOfFailure(error) });
      env.report(error);
    }
  };

  const applyEvent = (event: DocumentEvent): void => {
    let result: V | MirrorReload;
    try {
      result = spec.fold(cell.read().value, event);
    } catch (error) {
      env.report(error);
      reloadInBackground();
      return;
    }
    if (isReload(result)) {
      const pages = result[RELOAD];
      const keptFor = keepUntilRead(event, fullLoads);
      if (pages === 'all' || !spec.loadPages) {
        reloadInBackground();
      } else {
        const reloading = reloadPages(pages, keptFor).finally(() => pageReloads.delete(reloading));
        pageReloads.add(reloading);
      }
      return;
    }
    commit(result, { cause: 'event', event, pages: null });
  };

  env.onDocumentEvent((event) => {
    if (!cell.live) return;
    if (isResync(event)) {
      if (started) reloadInBackground();
      return;
    }
    if (queued) {
      // Folded once the running load lands: shown until then.
      queued.push(event);
      keepUntilRead(event, fullLoads - 1);
    } else {
      applyEvent(event);
    }
  });

  const loadOnce = async (): Promise<void> => {
    if (spec.readable && !spec.readable()) {
      cell.write({ ...cell.read(), status: 'forbidden' });
      return;
    }
    if (cell.read().status !== 'ready') cell.write({ ...cell.read(), status: 'loading' });
    const load = ++fullLoads;
    queued = [];
    let loaded: { value: V; cursor?: number | null };
    try {
      loaded = await spec.load(env.doc, env.lifetime);
    } catch (error) {
      const pending = queued ?? [];
      queued = null;
      if (!cell.live || isPluginError(error, 'instance-closed')) return;
      cell.write({ ...cell.read(), status: statusOfFailure(error) });
      for (const event of pending) applyEvent(event);
      throw error;
    }
    const pending = queued ?? [];
    queued = null;
    if (!cell.live) return;
    const previous = cell.read().value;
    cell.write({ value: loaded.value, status: 'ready' });
    announce({ cause: 'load', event: null, pages: 'all', previous, next: loaded.value });
    const cursor = loaded.cursor ?? null;
    for (const event of pending) {
      const serverId = 'origin' in event ? event.origin.serverId : null;
      if (cursor !== null && serverId !== null && serverId <= cursor) continue;
      applyEvent(event);
    }
    releaseLoadedBy(load);
  };

  function refresh(): Promise<void> {
    started = true;
    if (running) {
      loadAgain = true;
      return running;
    }
    running = (async () => {
      let failure: unknown = null;
      do {
        loadAgain = false;
        try {
          await loadOnce();
          failure = null;
        } catch (error) {
          failure = error;
        }
      } while (loadAgain && cell.live);
      if (failure !== null) throw failure;
    })().finally(() => {
      running = null;
    });
    return running;
  }

  return {
    mirror: {
      get: () => cell.read().value,
      view,
      getStatus: () => cell.read().status,
      refresh,
      async settled() {
        while (running || pageReloads.size > 0) {
          await Promise.allSettled([running, ...pageReloads]);
        }
      },
    },
    start() {
      if (!started) reloadInBackground();
    },
  };
}
