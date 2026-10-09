/**
 * Page mirrors: engine data that is loaded page by page, on demand, and kept
 * current from the document event stream.
 *
 * A page is `idle` until something calls `ensureLoaded(page)`. Once loaded it
 * stays current: an event the spec maps to that page either folds into the
 * page's value or re-reads it. Every read carries a per-page epoch, so a read
 * that started before a newer one can never overwrite it. Loads for the same
 * page are shared while in flight. Deleted pages are dropped, and
 * `stream.desynced` / `document.versioned` re-read every loaded page.
 *
 * `view(page)` is the page's value with this session's pending changes on
 * top (`predict`), as for whole-document mirrors (mirror.ts): an answered
 * change that made a page read again stays in that page's view until the
 * read lands.
 */
import {
  encodePageKey,
  type DocumentEvent,
  type DocumentHandle,
  type PageRef,
} from '@embedpdf/engine-core/runtime';
import type { PredictedOp, QueuedChange } from './changes';
import { isPluginError } from './errors';
import {
  changeIdOf,
  isResync,
  replay,
  showingWith,
  statusOfFailure,
  type MirrorEnvironment,
} from './mirror';
import type { OperationOptions, ResourceStatus } from './types';

/** One applied change of one page, handed to the spec's `changed` callback. */
export interface PageMirrorChange<V> {
  readonly page: PageRef;
  /** `load` for reads, `event` for a folded event, `drop` when the page was deleted. */
  readonly cause: 'load' | 'event' | 'drop';
  readonly event: DocumentEvent | null;
  readonly previous: V | undefined;
  readonly next: V | undefined;
}

export interface PageMirrorSpec<V> {
  /** Unique within the plugin; names the store cell and appears in errors. */
  readonly name: string;
  /** Read one page's value. */
  load(doc: DocumentHandle, page: PageRef, signal: AbortSignal): Promise<V>;
  /**
   * Which pages an event makes stale: those pages, every loaded page
   * (`'all'`), or none (`null`). Only pages that are loaded are affected.
   */
  affected(event: DocumentEvent): readonly PageRef[] | 'all' | null;
  /**
   * Apply an event to an affected page's value instead of re-reading it.
   * Return `'reload'` to re-read. Without `fold`, affected pages are re-read.
   */
  fold?(value: V, event: DocumentEvent, page: PageRef): V | 'reload';
  /**
   * Apply one op of a pending change of this session to a loaded page's
   * value, as the engine will. Pure and absolute, like a mirror's `predict`;
   * return `value` itself for an op that doesn't concern the page. Without
   * it, `view(page)` is `get(page)`.
   */
  predict?(value: V, op: PredictedOp, page: PageRef): V;
  /** Runs after every load of a page (even one that changed nothing) and every applied change. */
  readonly changed?: (change: PageMirrorChange<V>) => void;
}

export interface PageMirror<V> {
  /** The page's value, or undefined when it has not loaded. */
  get(page: PageRef): V | undefined;
  /** What the user sees on the page: `get(page)` with this session's pending changes on top. */
  view(page: PageRef): V | undefined;
  getStatus(page: PageRef): ResourceStatus;
  /** Load the page unless it is loaded or loading. */
  ensureLoaded(page: PageRef, options?: OperationOptions): Promise<void>;
  /** Re-read one page, or every loaded page. */
  refresh(page?: PageRef): Promise<void>;
}

interface PageEntry<V> {
  readonly page: PageRef;
  readonly status: ResourceStatus;
  readonly value?: V;
}

type PageCells<V> = Readonly<Record<string, PageEntry<V>>>;

const IDLE = 'idle' as const;

export function createPageMirror<V>(
  spec: PageMirrorSpec<V>,
  env: MirrorEnvironment,
): PageMirror<V> {
  const cell = env.cell<PageCells<V>>(`page-mirror/${spec.name}`, {});
  const epochs = new Map<string, number>();
  const inFlight = new Map<string, Promise<void>>();

  /**
   * Per page: answered changes the page still shows, because an event of
   * theirs made it read again. `epoch`: the page's epoch then; a later read
   * that lands clears them.
   */
  const kept = new Map<string, Map<string, { change: QueuedChange; epoch: number }>>();
  let keptVersion = 0;

  const keepUntilRead = (key: string, event: DocumentEvent): void => {
    const opId = changeIdOf(event);
    const change = opId !== null && spec.predict ? env.changes.find(opId) : undefined;
    if (!change) return;
    let page = kept.get(key);
    if (!page) kept.set(key, (page = new Map()));
    page.set(change.opId, { change, epoch: epochs.get(key) ?? 0 });
    keptVersion += 1;
  };

  const releasePage = (key: string, epoch: number): void => {
    const page = kept.get(key);
    if (!page) return;
    const before = page.size;
    for (const [opId, entry] of page) if (entry.epoch < epoch) page.delete(opId);
    if (page.size === 0) kept.delete(key);
    if (page.size === before) return;
    keptVersion += 1;
    env.notify();
  };

  const views = new Map<string, { value: V; version: number; kept: number; view: V }>();
  const view = (page: PageRef): V | undefined => {
    const key = encodePageKey(page);
    const value = entryOf(key)?.value;
    if (value === undefined || !spec.predict) return value;
    const version = env.changes.version();
    const memo = views.get(key);
    if (memo && memo.value === value && memo.version === version && memo.kept === keptVersion) {
      return memo.view;
    }
    const predict = spec.predict;
    const next = replay(
      value,
      showingWith(env.changes, kept.get(key)?.values() ?? []),
      (current: V, op: PredictedOp) => predict(current, op, page),
      env.report,
    );
    views.set(key, { value, version, kept: keptVersion, view: next });
    return next;
  };

  const entryOf = (key: string): PageEntry<V> | undefined => cell.read()[key];

  const setEntry = (key: string, entry: PageEntry<V> | null): boolean => {
    const { [key]: _replaced, ...rest } = cell.read();
    return cell.write(entry ? { ...rest, [key]: entry } : rest);
  };

  const announce = (change: PageMirrorChange<V>): void => {
    if (change.cause !== 'load' && change.previous === change.next) return;
    try {
      spec.changed?.(change);
    } catch (error) {
      env.report(error);
    }
  };

  const load = (page: PageRef): Promise<void> => {
    const key = encodePageKey(page);
    const epoch = (epochs.get(key) ?? 0) + 1;
    epochs.set(key, epoch);
    const before = entryOf(key);
    if (before?.status !== 'ready')
      setEntry(key, { page, status: 'loading', value: before?.value });
    const isCurrent = () => cell.live && epochs.get(key) === epoch;
    const request = spec
      .load(env.doc, page, env.lifetime)
      .then(
        (value) => {
          if (!isCurrent()) return;
          const previous = entryOf(key)?.value;
          setEntry(key, { page, status: 'ready', value });
          announce({ page, cause: 'load', event: null, previous, next: value });
          if (kept.has(key)) releasePage(key, epoch);
        },
        (error: unknown) => {
          if (!isCurrent() || isPluginError(error, 'instance-closed')) return;
          setEntry(key, { page, status: statusOfFailure(error), value: entryOf(key)?.value });
          throw error;
        },
      )
      .finally(() => {
        if (inFlight.get(key) === request) inFlight.delete(key);
      });
    inFlight.set(key, request);
    return request;
  };

  const reloadInBackground = (page: PageRef): void => {
    void load(page).catch(() => {
      /* the failure is reported through getStatus(page) */
    });
  };

  const loadedPages = (): PageRef[] =>
    Object.values(cell.read())
      .filter((entry) => entry.status !== IDLE)
      .map((entry) => entry.page);

  env.onDocumentEvent((event) => {
    if (!cell.live) return;
    if (isResync(event)) {
      for (const page of loadedPages()) reloadInBackground(page);
      return;
    }
    if (event.type === 'pages.deleted') {
      for (const page of event.pages) {
        const key = encodePageKey(page);
        const before = entryOf(key);
        if (!before) continue;
        epochs.set(key, (epochs.get(key) ?? 0) + 1);
        kept.delete(key);
        views.delete(key);
        setEntry(key, null);
        announce({ page, cause: 'drop', event, previous: before.value, next: undefined });
      }
      return;
    }
    const affected = spec.affected(event);
    if (affected === null) return;
    const pages = affected === 'all' ? loadedPages() : affected;
    for (const page of pages) {
      const key = encodePageKey(page);
      const entry = entryOf(key);
      if (!entry || entry.status === IDLE) continue;
      if (!spec.fold || entry.status !== 'ready') {
        keepUntilRead(key, event);
        reloadInBackground(page);
        continue;
      }
      let next: V | 'reload';
      try {
        next = spec.fold(entry.value as V, event, page);
      } catch (error) {
        env.report(error);
        next = 'reload';
      }
      if (next === 'reload') {
        keepUntilRead(key, event);
        reloadInBackground(page);
        continue;
      }
      if (next === entry.value) continue;
      epochs.set(key, (epochs.get(key) ?? 0) + 1);
      setEntry(key, { page, status: 'ready', value: next });
      announce({ page, cause: 'event', event, previous: entry.value, next });
    }
  });

  return {
    get: (page) => entryOf(encodePageKey(page))?.value,
    view,
    getStatus: (page) => entryOf(encodePageKey(page))?.status ?? IDLE,
    ensureLoaded(page) {
      const key = encodePageKey(page);
      const running = inFlight.get(key);
      if (running) return running;
      if (entryOf(key)?.status === 'ready') return Promise.resolve();
      return load(page);
    },
    refresh(page) {
      if (page) return load(page);
      return Promise.all(loadedPages().map((loaded) => load(loaded))).then(() => undefined);
    },
  };
}
