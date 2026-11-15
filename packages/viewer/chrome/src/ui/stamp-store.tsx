/**
 * The user's stamp libraries live in the browser (IndexedDB): restored once
 * per workspace, written on every change, for as long as the viewer lives —
 * a signature made while the stamps sidebar is closed is persisted exactly
 * like a stamp imported while it is open. The app's own libraries
 * (`plugins.stamp.libraries`) come in right after the stored ones. Neither
 * they nor the built-in library are ever stored: they come from the app again
 * next time, the built-in one in the locale of that moment, brought in lazily
 * by the panels that need it (`ensureDefaultLibrary`).
 *
 * Mounted once in the Shell, workspace-scoped (the stamp plugin is).
 */
import { useEffect } from 'react';
import {
  indexedDbByteStore,
  persistStampLibraries,
  restoreStampLibraries,
  useStamp,
  type StampCapability,
} from '@embedpdf/react/stamp';
import { useStampSettings } from '../config-context';
import { ensureAppLibraries } from '../config/app-stamps';
import { DEFAULT_LIBRARY_ID } from '../config/default-stamps';

const store =
  typeof indexedDB === 'undefined'
    ? null
    : indexedDbByteStore('embedpdf-stamps', { storeName: 'libraries' });

const restored = new WeakMap<StampCapability, Promise<unknown>>();

/** Bring the stored libraries back — once per workspace, whoever asks first. */
export const restoreStampLibrariesOnce = (stamp: StampCapability): Promise<unknown> => {
  let pending = restored.get(stamp);
  if (!pending) {
    pending = store ? restoreStampLibraries(stamp, store) : Promise.resolve();
    restored.set(stamp, pending);
  }
  return pending;
};

export function StampLibraryStore() {
  const stamp = useStamp();
  const { libraries } = useStampSettings();
  useEffect(() => {
    restoreStampLibrariesOnce(stamp)
      .then(() => ensureAppLibraries(stamp, libraries ?? []))
      .catch((error: unknown) => console.error('[embedpdf] stamp libraries failed:', error));
    const except = [DEFAULT_LIBRARY_ID, ...(libraries ?? []).map((library) => library.id)];
    return store ? persistStampLibraries(stamp, store, { except }) : undefined;
    // `libraries` is read once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp]);
  return null;
}
