/**
 * The viewer handle — `el.viewer`, the DRIVE door of the customization model.
 *
 * Deliberately a THIN SKIN over the kernel: `get()` returns each plugin's
 * PUBLIC capability lens exactly as the plugin defined it (the internal/public
 * two-lens split in the plugins IS the curation — this file adds no facade,
 * no second vocabulary, no second write path). `watch()` is the kernel's one
 * change stream, selector-shaped — `useSelector` without React. The command
 * trio is the UI altitude of the same system, for anything button-shaped.
 *
 * Rule of thumb (docs): buttons speak commands; code speaks capabilities.
 *
 * The chrome itself runs on these exact primitives (customer #1), so parity
 * between "what our UI can do" and "what el.viewer can do" is structural.
 */
import type {
  ActiveDocumentChangedEvent,
  CapabilityToken,
  DocumentClosedEvent,
  DocumentLockedEvent,
  DocumentOpenedEvent,
  DocumentOpenFailedEvent,
  DocumentPagesChangedEvent,
  DocumentsCapability,
  EventHook,
  Kernel,
  Unsubscribe,
} from '@embedpdf/react/runtime';

/** The document lifecycle events `viewer.on(event, listener)` subscribes, by
 *  short name — the same hooks as `viewer.documents.on*`. */
export interface ViewerEvents {
  opened: DocumentOpenedEvent;
  openFailed: DocumentOpenFailedEvent;
  locked: DocumentLockedEvent;
  closed: DocumentClosedEvent;
  activeChanged: ActiveDocumentChangedEvent;
  pagesChanged: DocumentPagesChangedEvent;
}
import { CommandsToken, resolvedCommandsEqual } from '@embedpdf/react/commands';
import type { ResolvedCommand } from '@embedpdf/react/commands';

/** `get`/`tryGet` bound to one document (see {@link ViewerHandle.forDocument}). */
export interface ScopedViewerHandle {
  get<T>(token: CapabilityToken<T>): T;
  tryGet<T>(token: CapabilityToken<T>): T | null;
}

export interface ViewerHandle extends ScopedViewerHandle {
  /** The document registry — the tab model: list/open/close/setActive/…. */
  readonly documents: DocumentsCapability;

  /** `get`/`tryGet` with document-scoped tokens bound to `documentId`
   *  instead of the active document. */
  forDocument(documentId: string): ScopedViewerHandle;

  /**
   * Re-run `select` on every kernel change; call `cb` when the selected value
   * really changed (`isEqual`, default `Object.is` — capability getters return
   * stable references between model changes, so identity works). Returns the
   * unsubscribe. This is the ONLY reactivity primitive; DOM events on the
   * element are sugar over it.
   */
  watch<T>(
    select: () => T,
    cb: (value: T, previous: T) => void,
    isEqual?: (a: T, b: T) => boolean,
  ): Unsubscribe;

  /** Subscribe to one document lifecycle event (`'opened'`, `'closed'`,
   *  `'activeChanged'`, …) — occurrences, never state; read state with `watch`. */
  on<K extends keyof ViewerEvents>(
    event: K,
    listener: (event: ViewerEvents[K]) => void,
  ): Unsubscribe;

  // ── commands: the UI vocabulary layered on the same capabilities ──────────
  execute(id: string, documentId?: string): void;
  resolve(id: string, documentId?: string): ResolvedCommand | null;
  /** `watch` sugar for one command's resolved state (label/icon/enabled/active). */
  watchCommand(id: string, cb: (cmd: ResolvedCommand | null) => void): Unsubscribe;
}

export function createViewerHandle(kernel: Kernel): ViewerHandle {
  const watch = <T>(
    select: () => T,
    cb: (value: T, previous: T) => void,
    isEqual: (a: T, b: T) => boolean = Object.is,
  ): Unsubscribe => {
    let previous = select();
    return kernel.subscribe(() => {
      const next = select();
      if (isEqual(previous, next)) return;
      const before = previous;
      previous = next;
      cb(next, before);
    });
  };

  const commands = () => kernel.capability(CommandsToken);
  const hooks: { [K in keyof ViewerEvents]: EventHook<ViewerEvents[K]> } = {
    opened: kernel.documents.onOpened,
    openFailed: kernel.documents.onOpenFailed,
    locked: kernel.documents.onLocked,
    closed: kernel.documents.onClosed,
    activeChanged: kernel.documents.onActiveChanged,
    pagesChanged: kernel.documents.onPagesChanged,
  };

  return {
    documents: kernel.documents,
    get: (token) => kernel.capability(token),
    tryGet: (token) => kernel.tryCapability(token),
    forDocument: (documentId) => ({
      get: (token) => kernel.capability(token, documentId),
      tryGet: (token) => kernel.tryCapability(token, documentId),
    }),
    watch,
    on: (event, listener) => hooks[event](listener as (e: ViewerEvents[typeof event]) => void),
    execute: (id, documentId) => void commands().execute(id, { documentId }),
    resolve: (id, documentId) => commands().resolveCommand(id, documentId) ?? null,
    watchCommand: (id, cb) =>
      watch(() => commands().resolveCommand(id) ?? null, cb, resolvedCommandsEqual),
  };
}
