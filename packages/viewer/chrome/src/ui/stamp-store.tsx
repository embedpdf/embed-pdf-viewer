/**
 * The user's stamp libraries live in the browser (IndexedDB): restored ONCE
 * per workspace, written on every change, for as long as the viewer lives —
 * a signature made while the stamps sidebar is closed is persisted exactly
 * like a stamp imported while it is open. The built-in library is never
 * stored (it is fetched again next time, in the locale of that moment); the
 * panels that need it bring it in lazily through `ensureDefaultLibrary`.
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
  useEffect(() => {
    void restoreStampLibrariesOnce(stamp);
    return store
      ? persistStampLibraries(stamp, store, { except: [DEFAULT_LIBRARY_ID] })
      : undefined;
  }, [stamp]);
  return null;
}
