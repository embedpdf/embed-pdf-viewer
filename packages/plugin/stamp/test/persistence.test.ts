import { describe, expect, it, vi } from 'vitest';

import { memoryStampStore, persistStampLibraries, restoreStampLibraries } from '../src/persistence';
import type { StampCapability, StampLibraryChange } from '../src/types';

function fakeStamp() {
  const listeners = new Set<(change: StampLibraryChange) => void>();
  const bytes = new Map<string, Uint8Array>();
  const stamp = {
    onLibraryChanged: (listener: (change: StampLibraryChange) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    exportLibrary: (id: string) => bytes.get(id) ?? null,
    importLibraryPdf: vi.fn(async (source: Uint8Array) => {
      const id = new TextDecoder().decode(source).replace('%PDF-', '');
      bytes.set(id, source);
      return id;
    }),
  } as unknown as StampCapability;
  const emit = (change: StampLibraryChange) => listeners.forEach((l) => l(change));
  return { stamp, bytes, emit };
}

describe('stamp persistence helper', () => {
  it('persists on change (coalesced), deletes on removal, skips excluded libraries', async () => {
    vi.useFakeTimers();
    const { stamp, bytes, emit } = fakeStamp();
    const store = memoryStampStore();
    bytes.set('mine', new TextEncoder().encode('%PDF-mine-v1'));
    bytes.set('embedpdf-standard', new TextEncoder().encode('%PDF-std'));
    const stop = persistStampLibraries(stamp, store, { except: ['embedpdf-standard'] });

    emit({ libraryId: 'mine', reason: 'created' });
    emit({ libraryId: 'mine', reason: 'asset-added' });
    emit({ libraryId: 'embedpdf-standard', reason: 'imported' });
    expect(await store.list()).toEqual([]);
    await vi.advanceTimersByTimeAsync(300);
    expect(
      (await store.list()).map((row) => [row.id, new TextDecoder().decode(row.bytes)]),
    ).toEqual([['mine', '%PDF-mine-v1']]);

    bytes.set('mine', new TextEncoder().encode('%PDF-mine-v2'));
    emit({ libraryId: 'mine', reason: 'asset-updated' });
    await vi.advanceTimersByTimeAsync(300);
    expect(new TextDecoder().decode((await store.list())[0].bytes)).toBe('%PDF-mine-v2');

    emit({ libraryId: 'mine', reason: 'removed' });
    await vi.advanceTimersByTimeAsync(0);
    expect(await store.list()).toEqual([]);
    stop();
    vi.useRealTimers();
  });

  it('stopping flushes a pending write', async () => {
    vi.useFakeTimers();
    const { stamp, bytes, emit } = fakeStamp();
    const store = memoryStampStore();
    bytes.set('mine', new TextEncoder().encode('%PDF-mine'));
    const stop = persistStampLibraries(stamp, store);
    emit({ libraryId: 'mine', reason: 'created' });
    stop();
    await vi.advanceTimersByTimeAsync(0);
    expect((await store.list()).map((row) => row.id)).toEqual(['mine']);
    vi.useRealTimers();
  });

  it('restore imports every stored PDF and reports the ids the plugin assigned', async () => {
    const { stamp } = fakeStamp();
    const store = memoryStampStore();
    await store.put('a', new TextEncoder().encode('%PDF-lib-a'));
    await store.put('b', new TextEncoder().encode('%PDF-lib-b'));
    const restored = await restoreStampLibraries(stamp, store);
    expect(restored).toEqual(['lib-a', 'lib-b']);
    expect(stamp.importLibraryPdf).toHaveBeenCalledTimes(2);
  });
});
