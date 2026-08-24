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
  CapabilityToken,
  DocumentsCapability,
  Kernel,
  Unsubscribe,
} from '@embedpdf/react/runtime';
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

  return {
    documents: kernel.documents,
    get: (token) => kernel.capability(token),
    tryGet: (token) => kernel.tryCapability(token),
    forDocument: (documentId) => ({
      get: (token) => kernel.capability(token, documentId),
      tryGet: (token) => kernel.tryCapability(token, documentId),
    }),
    watch,
    execute: (id, documentId) => commands().execute(id, documentId),
    resolve: (id, documentId) => commands().resolve(id, documentId) ?? null,
    watchCommand: (id, cb) =>
      watch(() => commands().resolve(id) ?? null, cb, resolvedCommandsEqual),
  };
}
