/**
 * Your own stamp libraries (`plugins.stamp.libraries`): each a PDF the app
 * ships, imported under the id the app gives it, so `quick` and the app's
 * commands can name its stamps (`'acme:Paid'`). They come from the app on
 * every visit: loaded when the viewer starts, right after the user's stored
 * libraries, never stored in the browser themselves, and not removable in the
 * panel, since the next visit would bring them back.
 */
import type { StampCapability } from '@embedpdf/react/stamp';
import type { StampLibraryFile } from '../plugin-settings';
import { fileBytes } from './file-bytes';

/** Per workspace: each library's load by id, so the store and the panel share one. */
const loads = new WeakMap<StampCapability, Map<string, Promise<void>>>();

/**
 * Bring `libraries` in, each once per workspace. A library already there
 * under its id, such as one the app made from code, is left alone. A load
 * that failed is tried again by the next call.
 */
export function ensureAppLibraries(
  stamp: StampCapability,
  libraries: readonly StampLibraryFile[],
): Promise<void> {
  let started = loads.get(stamp);
  if (!started) loads.set(stamp, (started = new Map()));
  const byId = started;
  const load = (library: StampLibraryFile): Promise<void> => {
    const current = byId.get(library.id);
    if (current) return current;
    const run = (async () => {
      if (stamp.getLibrary(library.id)) return;
      const bytes = await fileBytes(library, `stamp library "${library.id}"`);
      await stamp.importLibrary(bytes, { id: library.id });
    })().catch((error: unknown) => {
      byId.delete(library.id);
      throw error;
    });
    byId.set(library.id, run);
    return run;
  };
  return Promise.all(libraries.map(load)).then(() => undefined);
}
