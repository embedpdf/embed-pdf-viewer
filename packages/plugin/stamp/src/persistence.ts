/**
 * Keeping custom libraries, over the plugin's public API, in any environment.
 *
 * The plugin knows when a library changes (`onLibraryChanged`) and what its
 * canonical bytes are (`exportLibrary`, a complete PDF). Where those bytes
 * live is the embedder's decision: {@link StampLibraryStore} is the port,
 * declared here DOM-free like every plugin port. The browser adapter is
 * `indexedDbByteStore` in `@embedpdf/web` (structurally this port), wired by
 * the framework layer; an embedder with its own backend implements the three
 * calls once. These helpers are the proof that the two capability calls are
 * all a store needs: each takes only the members it uses, so a framework's
 * own service of the plugin works as well as the capability.
 */
import type { StampCapability } from './contract';

/** The persistence port: bytes by library id. */
export interface StampLibraryStore {
  list(): Promise<Array<{ id: string; bytes: Uint8Array }>>;
  put(id: string, bytes: Uint8Array): Promise<void>;
  delete(id: string): Promise<void>;
}

/** An in-memory store, for tests and SSR. */
export function memoryStampStore(): StampLibraryStore {
  const rows = new Map<string, Uint8Array>();
  return {
    list: async () => [...rows.entries()].map(([id, bytes]) => ({ id, bytes })),
    put: async (id, bytes) => {
      rows.set(id, new Uint8Array(bytes));
    },
    delete: async (id) => {
      rows.delete(id);
    },
  };
}

/**
 * Bring every stored library back: each PDF is imported as-is (its title,
 * registry, and PieceInfo id come from the file; the store's key is only a
 * hint). Call once at boot, before seeding defaults, so "already has
 * libraries" means the user's own.
 */
export async function restoreStampLibraries(
  stamp: Pick<StampCapability, 'importLibrary'>,
  store: StampLibraryStore,
): Promise<string[]> {
  const restored: string[] = [];
  for (const { id, bytes } of await store.list()) {
    try {
      restored.push((await stamp.importLibrary(bytes)).library.id);
    } catch (error) {
      globalThis.console?.warn(`[stamp] stored library '${id}' could not be restored:`, error);
    }
  }
  return restored;
}

/**
 * Keep the store in sync from now on: every canonical change saves the
 * library's PDF, a removal deletes it. `except` names libraries never to
 * persist (the bundled default set, typically). Returns the unsubscribe;
 * work already asked for still finishes.
 *
 * Each library has one line of store work, so saves never overlap and a
 * delete never lands under a late save. The changes of one burst (one call
 * into the plugin) are one save; the changes made while a save runs are one
 * more after it.
 */
export function persistStampLibraries(
  stamp: Pick<StampCapability, 'exportLibrary' | 'onLibraryChanged'>,
  store: StampLibraryStore,
  options: { except?: readonly string[] } = {},
): () => void {
  const except = new Set(options.except ?? []);
  /** Per library: the store step waiting or running, and the one to follow it. */
  const lines = new Map<string, { step: Step; started: boolean; next: Step | null }>();

  const run = (libraryId: string, step: Step): void => {
    const line = lines.get(libraryId);
    if (line) {
      // Not started yet: it does the latest wish. Running: the latest wish follows it.
      if (line.started) line.next = step;
      else line.step = step;
      return;
    }
    const fresh = { step, started: false, next: null as Step | null };
    lines.set(libraryId, fresh);
    // Starts once the current burst of changes is over, so the burst is one step.
    void Promise.resolve().then(async () => {
      fresh.started = true;
      try {
        if (fresh.step === 'save') await store.put(libraryId, await stamp.exportLibrary(libraryId));
        else await store.delete(libraryId);
      } catch (error) {
        const doing = fresh.step === 'save' ? 'persisting' : 'deleting stored';
        globalThis.console?.warn(`[stamp] ${doing} library '${libraryId}' failed:`, error);
      }
      lines.delete(libraryId);
      if (fresh.next) run(libraryId, fresh.next);
    });
  };

  return stamp.onLibraryChanged(({ libraryId, reason }) => {
    if (except.has(libraryId)) return;
    run(libraryId, reason === 'removed' ? 'delete' : 'save');
  });
}

/** What a library's line does next in the store. */
type Step = 'save' | 'delete';
