/**
 * The viewer controller: one object over a kernel for an app that brings its own buttons.
 *
 * It reads every value from the plugins' own capabilities (`kernel.tryCapability`) and calls
 * their own verbs, so it holds no second copy of any state and adds no second write path. What
 * it adds is the shape a toolbar wants: one snapshot of everything a toolbar shows
 * (`getState()`, the same object until something in it changes), one `subscribe()`, and the
 * common commands by their everyday names, each a one-line call into the plugin that owns it.
 * A plugin the app didn't install reads as its empty value, and its commands do nothing (or
 * reject `unsupported` when they return a promise). Anything beyond it is one `get(token)` away.
 */
import type {
  CapabilityToken,
  DocumentInfo,
  Kernel,
  OpenDocumentOptions,
  OpenSource,
  PageDestination,
  PluginErrorInfo,
  PrintOptions,
  DownloadOptions,
  Unsubscribe,
} from '@embedpdf/core';
import { PluginError } from '@embedpdf/core';
import type { Rotation } from '@embedpdf/core-geometry';
import { HistoryToken } from '@embedpdf/plugin-history';
import { OutlineToken } from '@embedpdf/plugin-outline';
import type { OutlineItemRef, OutlineRow } from '@embedpdf/plugin-outline';
import { SearchToken } from '@embedpdf/plugin-search';
import type { SearchQuery, SearchStatus } from '@embedpdf/plugin-search';
import { SelectionToken } from '@embedpdf/plugin-selection';
import { StageToken } from '@embedpdf/plugin-stage';
import type { ZoomModeValue } from '@embedpdf/plugin-stage';

/** Where the document in view stands. `empty` before one is opened. */
export type ViewerStatus = 'empty' | 'loading' | 'locked' | 'ready' | 'error';

/** The search, as a find bar shows it. */
export interface ViewerSearchState {
  /** The text searched for; `''` when nothing is. */
  readonly query: string;
  readonly status: SearchStatus;
  readonly hitCount: number;
  /** The highlighted hit, from 0; `-1` when none is. */
  readonly activeHitIndex: number;
}

/**
 * Everything a toolbar shows, for the document in view. The same object until one of its
 * fields changes, so comparing by reference tells whether to draw again.
 */
export interface ViewerState {
  readonly status: ViewerStatus;
  readonly documentId: string | null;
  /** `error`: why the document couldn't be opened. */
  readonly error: PluginErrorInfo | null;
  /** `locked`: a password was tried and was wrong. */
  readonly passwordRejected: boolean;
  /** The page in view, from 0; `-1` without a document. */
  readonly pageIndex: number;
  readonly pageCount: number;
  readonly canGoNext: boolean;
  readonly canGoPrevious: boolean;
  /** The zoom level: 1 is 100%. */
  readonly zoom: number;
  /** The fit the zoom follows, or `custom` for a set level. */
  readonly zoomMode: ZoomModeValue | 'custom';
  readonly canZoomIn: boolean;
  readonly canZoomOut: boolean;
  /** How the view is turned, in degrees clockwise. */
  readonly rotation: Rotation;
  /** The outline rows a tree view shows (children of collapsed items left out), with their depth. */
  readonly outline: readonly OutlineRow[];
  /** The outline item for where the view is reading. */
  readonly currentOutlineItem: OutlineItemRef | null;
  readonly search: ViewerSearchState;
  readonly hasSelection: boolean;
  /** The selected text, once the user let go; `''` without a selection. */
  readonly selectionText: string;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /** Changes that weren't downloaded yet. */
  readonly dirty: boolean;
  readonly canPrint: boolean;
  readonly canDownload: boolean;
}

/** Zoom by name: a fit, or a level (1 is 100%). */
export type ViewerZoom = number | ZoomModeValue;

/** What `on()` reports. */
export interface ViewerEvents {
  /** The page in view changed. */
  readonly pagechange: { readonly pageIndex: number; readonly previousPageIndex: number };
  /** A document opened and is ready. */
  readonly documentopen: { readonly documentId: string };
  /** A document couldn't be opened. */
  readonly documenterror: { readonly documentId: string; readonly error: PluginErrorInfo };
  /** A search finished. */
  readonly searchcomplete: { readonly query: string; readonly hitCount: number };
  /** `download()` produced the file. */
  readonly download: { readonly documentId: string; readonly bytes: Uint8Array };
}

export interface ViewerController {
  /** The kernel underneath, for everything this object doesn't name. */
  readonly kernel: Kernel;
  /** The snapshot a toolbar draws from. */
  getState(): ViewerState;
  /** Called after every change of `getState()`, with the new snapshot. */
  subscribe(listener: (state: ViewerState) => void): Unsubscribe;
  on<Name extends keyof ViewerEvents>(
    name: Name,
    handler: (event: ViewerEvents[Name]) => void,
  ): Unsubscribe;
  /** A plugin's own API for the document in view, or `null` without one. */
  get<T>(token: CapabilityToken<T>): T | null;

  /** Open a document (a URL string, or any `OpenSource`) and show it. Resolves its id. */
  open(source: string | OpenSource, options?: OpenDocumentOptions): Promise<string>;
  /** Try a password on a locked document. */
  unlock(password: string): Promise<void>;
  /** Close the document in view. */
  close(): Promise<void>;

  /** Go to a page, from 0. */
  goToPage(pageIndex: number): void;
  nextPage(): void;
  previousPage(): void;
  goToDestination(destination: PageDestination): void;
  /** Follow an outline item: its page, or its link. */
  goToOutlineItem(ref: OutlineItemRef): void;
  toggleOutlineItem(ref: OutlineItemRef): void;

  zoomIn(): void;
  zoomOut(): void;
  setZoom(zoom: ViewerZoom): void;
  /** Turn the view by 90° (clockwise) or -90°. */
  rotate(delta?: 90 | -90): void;

  /** Search the document; a string searches its words as typed. */
  search(query: string | SearchQuery): Promise<void>;
  nextHit(): void;
  previousHit(): void;
  clearSearch(): void;

  /** The selected text, read again; `''` without a selection. */
  readSelection(): Promise<string>;
  clearSelection(): void;
  undo(): void;
  redo(): void;

  print(options?: PrintOptions): Promise<void>;
  /** The PDF with every change (appended to the original by default; `mode: 'rewrite'` writes a fresh file). */
  download(options?: DownloadOptions): Promise<Uint8Array>;

  /** Stop listening to the kernel. The kernel itself stays: whoever made it destroys it. */
  dispose(): void;
}

export interface ViewerControllerOptions {
  /**
   * Follow this document instead of the active one; a function is asked on every read (an
   * adapter's document scope), and the active one is followed while it returns `null`.
   */
  readonly documentId?: string | (() => string | null);
}

const EMPTY_SEARCH: ViewerSearchState = Object.freeze({
  query: '',
  status: 'idle',
  hitCount: 0,
  activeHitIndex: -1,
});

const NO_ROWS: readonly OutlineRow[] = Object.freeze([]);

function statusOf(info: DocumentInfo | null): ViewerStatus {
  return info ? info.status : 'empty';
}

function searchEqual(a: ViewerSearchState, b: ViewerSearchState): boolean {
  return (
    a.query === b.query &&
    a.status === b.status &&
    a.hitCount === b.hitCount &&
    a.activeHitIndex === b.activeHitIndex
  );
}

/** The new snapshot, or the old one when no field changed. */
function keepIfSame(previous: ViewerState | null, next: ViewerState): ViewerState {
  if (!previous) return Object.freeze(next);
  let same = true;
  for (const key of Object.keys(next) as (keyof ViewerState)[]) {
    if (
      key === 'search'
        ? !searchEqual(previous.search, next.search)
        : !Object.is(previous[key], next[key])
    ) {
      same = false;
      break;
    }
  }
  if (same) return previous;
  return Object.freeze(
    searchEqual(previous.search, next.search) ? { ...next, search: previous.search } : next,
  );
}

const unsupported = (what: string) =>
  new PluginError('unsupported', 'viewer', `${what} needs its plugin installed`);

/**
 * A controller over a kernel someone else created and owns (a `<Viewer>`'s, or
 * `createViewer()`'s). It follows the active document, or `options.documentId`.
 */
export function createViewerController(
  kernel: Kernel,
  options: ViewerControllerOptions = {},
): ViewerController {
  const listeners = new Set<(state: ViewerState) => void>();
  // One set per event name; `on()` and `emit()` keep each set to its own event's handlers.
  const handlers = new Map<keyof ViewerEvents, Set<(event: never) => void>>();
  let state: ViewerState | null = null;
  let disposed = false;
  // The selected text, read once the user lets go, for the document it was read in.
  let selection: { documentId: string; text: string } | null = null;
  // Event subscriptions on the document in view, made again when it changes.
  let followed: string | null = null;
  let stopFollowing: Unsubscribe[] = [];
  const outlineRequested = new Set<string>();

  const emit = <Name extends keyof ViewerEvents>(name: Name, event: ViewerEvents[Name]) => {
    const set = handlers.get(name) as Set<(event: ViewerEvents[Name]) => void> | undefined;
    set?.forEach((handler) => handler(event));
  };

  const pinned = (): string | null =>
    typeof options.documentId === 'function' ? options.documentId() : (options.documentId ?? null);
  const documentId = (): string | null => pinned() ?? kernel.documents.getActiveId();
  const info = (): DocumentInfo | null => {
    const id = documentId();
    return id === null ? null : kernel.documents.get(id);
  };
  const get = <T>(token: CapabilityToken<T>): T | null => {
    const id = documentId();
    return id === null ? null : kernel.tryCapability(token, id);
  };
  const need = <T>(token: CapabilityToken<T>, what: string): T => {
    const capability = get(token);
    if (!capability) throw unsupported(what);
    return capability;
  };

  function follow(id: string | null) {
    if (id === followed) return;
    stopFollowing.forEach((stop) => stop());
    stopFollowing = [];
    followed = id;
    if (id === null) return;
    const picked = kernel.tryCapability(SelectionToken, id);
    if (!picked) return;
    stopFollowing.push(
      picked.onCommitted(() => {
        picked.readText().then(
          (text) => {
            if (disposed || followed !== id || !picked.hasSelection()) return;
            selection = { documentId: id, text };
            refresh();
          },
          () => {},
        );
      }),
      picked.onCleared(() => {
        selection = null;
        refresh();
      }),
    );
  }

  function read(): ViewerState {
    const doc = info();
    const id = doc?.id ?? null;
    const ready = doc?.status === 'ready';
    const stage = ready ? get(StageToken) : null;
    const outline = ready ? get(OutlineToken) : null;
    const search = ready ? get(SearchToken) : null;
    const picked = ready ? get(SelectionToken) : null;
    const history = ready ? get(HistoryToken) : null;
    if (outline && id && !outlineRequested.has(id)) {
      // Nothing reads the outline when a document opens; a toolbar with a sidebar wants it.
      outlineRequested.add(id);
      outline.ensureLoaded().catch(() => {});
    }
    const query = search?.getQuery();
    const hasSelection = picked?.hasSelection() ?? false;
    return {
      status: statusOf(doc),
      documentId: id,
      error: doc?.status === 'error' ? (doc.error ?? null) : null,
      passwordRejected: doc?.status === 'locked' ? doc.passwordProvided === true : false,
      pageIndex: stage ? stage.getCurrentPageIndex() : ready ? 0 : -1,
      pageCount: doc?.pageCount ?? 0,
      canGoNext: stage?.canGoNext() ?? false,
      canGoPrevious: stage?.canGoPrevious() ?? false,
      zoom: stage?.getZoomLevel() ?? 1,
      zoomMode: stage?.getZoomMode() ?? 'custom',
      canZoomIn: stage?.canZoomIn() ?? false,
      canZoomOut: stage?.canZoomOut() ?? false,
      rotation: stage?.getViewRotation() ?? 0,
      outline: outline?.listRows() ?? NO_ROWS,
      currentOutlineItem: outline?.getCurrentItem() ?? null,
      search: search
        ? {
            query: query?.text ?? '',
            status: search.getStatus(),
            hitCount: search.getHitCount(),
            activeHitIndex: search.getActiveHitIndex(),
          }
        : EMPTY_SEARCH,
      hasSelection,
      selectionText: hasSelection && selection?.documentId === id ? selection.text : '',
      canUndo: history?.canUndo() ?? false,
      canRedo: history?.canRedo() ?? false,
      dirty: doc?.hasUnsavedChanges ?? false,
      canPrint: ready ? kernel.documents.canPrint(id ?? undefined) : false,
      canDownload: ready ? kernel.documents.canDownload(id ?? undefined) : false,
    };
  }

  function refresh() {
    if (disposed) return;
    const previous = state;
    follow(info()?.status === 'ready' ? documentId() : null);
    const next = keepIfSame(previous, read());
    if (next === previous) return;
    state = next;
    if (
      previous &&
      previous.documentId === next.documentId &&
      previous.pageIndex !== next.pageIndex &&
      next.pageIndex >= 0
    ) {
      emit('pagechange', { pageIndex: next.pageIndex, previousPageIndex: previous.pageIndex });
    }
    if (next.search.status === 'complete' && previous?.search.status !== 'complete') {
      emit('searchcomplete', { query: next.search.query, hitCount: next.search.hitCount });
    }
    listeners.forEach((listener) => listener(next));
  }

  const stops: Unsubscribe[] = [
    kernel.subscribe(refresh),
    kernel.documents.onOpened((event) => {
      if (pinned() === null || event.documentId === pinned()) {
        emit('documentopen', { documentId: event.documentId });
      }
    }),
    kernel.documents.onOpenFailed((event) => {
      if (pinned() === null || event.documentId === pinned()) {
        emit('documenterror', { documentId: event.documentId, error: event.error });
      }
    }),
  ];

  const toQuery = (query: string | SearchQuery): SearchQuery =>
    typeof query === 'string' ? { text: query } : query;

  const controller: ViewerController = {
    kernel,
    getState() {
      if (!state) state = keepIfSame(null, read());
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    on(name, handler) {
      let set = handlers.get(name);
      if (!set) handlers.set(name, (set = new Set()));
      set.add(handler);
      return () => set.delete(handler);
    },
    get,

    async open(source, openOptions) {
      const input: OpenSource = typeof source === 'string' ? { kind: 'url', url: source } : source;
      const { document } = await kernel.documents.open(input, openOptions);
      if (pinned() === null) kernel.documents.setActive(document.id);
      return document.id;
    },
    async unlock(password) {
      const id = documentId();
      if (id === null) throw new PluginError('not-ready', 'viewer', 'No document is open');
      await kernel.documents.unlock(id, { password });
    },
    async close() {
      const id = documentId();
      if (id !== null) await kernel.documents.close(id);
    },

    goToPage: (pageIndex) => get(StageToken)?.goToPage(pageIndex),
    nextPage: () => get(StageToken)?.nextPage(),
    previousPage: () => get(StageToken)?.previousPage(),
    goToDestination: (destination) => get(StageToken)?.goToDestination(destination),
    goToOutlineItem: (ref) => void get(OutlineToken)?.activate(ref),
    toggleOutlineItem: (ref) => get(OutlineToken)?.toggle(ref),

    zoomIn: () => get(StageToken)?.zoomIn(),
    zoomOut: () => get(StageToken)?.zoomOut(),
    setZoom(zoom) {
      get(StageToken)?.zoomTo(typeof zoom === 'number' ? zoom : { mode: zoom });
    },
    rotate: (delta = 90) => get(StageToken)?.rotateViewBy(delta),

    async search(query) {
      const search = need(SearchToken, 'search()');
      const asked = toQuery(query);
      if (asked.text === '') {
        search.clear();
        return;
      }
      await search.search(asked);
    },
    nextHit: () => void get(SearchToken)?.nextHit(),
    previousHit: () => void get(SearchToken)?.previousHit(),
    clearSearch: () => get(SearchToken)?.clear(),

    async readSelection() {
      const picked = get(SelectionToken);
      return picked?.hasSelection() ? picked.readText() : '';
    },
    clearSelection: () => get(SelectionToken)?.clear(),
    undo: () => get(HistoryToken)?.undo(),
    redo: () => get(HistoryToken)?.redo(),

    async print(printOptions) {
      await kernel.documents.print(documentId() ?? undefined, printOptions);
    },
    async download(downloadOptions) {
      const id = documentId();
      if (id === null) throw new PluginError('not-ready', 'viewer', 'No document is open');
      const bytes = await kernel.documents.download(id, downloadOptions);
      emit('download', { documentId: id, bytes });
      return bytes;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      stops.forEach((stop) => stop());
      follow(null);
      listeners.clear();
    },
  };
  return controller;
}
