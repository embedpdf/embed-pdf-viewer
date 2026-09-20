/**
 * Keeping custom libraries — over the plugin's public API, in any environment.
 *
 * The plugin knows WHEN a library changes (`onLibraryChanged`) and WHAT its
 * canonical bytes are (`exportLibrary`, a complete PDF). WHERE those bytes
 * live is the embedder's decision: {@link StampLibraryStore} is the port,
 * declared here DOM-free like every plugin port. The browser adapter is
 * `indexedDbByteStore` in `@embedpdf/web` (structurally this port), wired by
 * the framework layer; an embedder with its own backend implements the three
 * calls once. These helpers are the proof that the two capability calls are
 * all a store needs.
 */
import type { StampCapability } from './types';

/** The persistence port: bytes by library id. */
export interface StampLibraryStore {
  list(): Promise<Array<{ id: string; bytes: Uint8Array }>>;
  put(id: string, bytes: Uint8Array): Promise<void>;
  delete(id: string): Promise<void>;
}

/** An in-memory store — tests and SSR. */
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
 * registry, and PieceInfo id come from the file — the store's key is only a
 * hint). Call once at boot, before seeding defaults, so "already has
 * libraries" means the user's own.
 */
export async function restoreStampLibraries(
  stamp: StampCapability,
  store: StampLibraryStore,
): Promise<string[]> {
  const restored: string[] = [];
  for (const { id, bytes } of await store.list()) {
    try {
      restored.push(await stamp.importLibraryPdf(bytes));
    } catch (error) {
      globalThis.console?.warn(`[stamp] stored library '${id}' could not be restored:`, error);
    }
  }
  return restored;
}

/**
 * Keep the store in sync from now on: every canonical change writes the
 * library's PDF (coalesced per library so a burst of edits saves once),
 * a removal deletes it. `except` names libraries never to persist — the
 * bundled default set, typically. Returns the unsubscribe.
 */
export function persistStampLibraries(
  stamp: StampCapability,
  store: StampLibraryStore,
  opts: { except?: readonly string[]; debounceMs?: number } = {},
): () => void {
  const except = new Set(opts.except ?? []);
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  const write = (libraryId: string) => {
    timers.delete(libraryId);
    const bytes = stamp.exportLibrary(libraryId);
    if (!bytes) return;
    store.put(libraryId, bytes).catch((error) => {
      globalThis.console?.warn(`[stamp] persisting library '${libraryId}' failed:`, error);
    });
  };
  const off = stamp.onLibraryChanged(({ libraryId, reason }) => {
    if (except.has(libraryId)) return;
    const pending = timers.get(libraryId);
    if (pending) clearTimeout(pending);
    if (reason === 'removed') {
      timers.delete(libraryId);
      store.delete(libraryId).catch((error) => {
        globalThis.console?.warn(`[stamp] deleting stored library '${libraryId}' failed:`, error);
      });
      return;
    }
    timers.set(
      libraryId,
      setTimeout(() => write(libraryId), opts.debounceMs ?? 250),
    );
  });
  return () => {
    off();
    for (const [libraryId, timer] of timers) {
      clearTimeout(timer);
      write(libraryId);
    }
  };
}
