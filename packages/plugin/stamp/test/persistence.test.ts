import { describe, expect, it, vi } from 'vitest';

import { memoryStampStore, persistStampLibraries, restoreStampLibraries } from '../src/persistence';
import type { StampCapability, StampLibraryChangedEvent } from '../src/contract';

function fakeStamp() {
  const listeners = new Set<(change: StampLibraryChangedEvent) => void>();
  const bytes = new Map<string, Uint8Array>();
  // Only the members the helpers use: a framework's own service of the plugin is enough.
  const stamp = {
    onLibraryChanged: (listener: (change: StampLibraryChangedEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    exportLibrary: async (id: string) => {
      const stored = bytes.get(id);
      if (!stored) throw new Error(`unknown library '${id}'`);
      return stored;
    },
    importLibrary: vi.fn(async (source: Uint8Array) => {
      const id = new TextDecoder().decode(source).replace('%PDF-', '');
      bytes.set(id, source);
      return { library: { id } };
    }),
  } as unknown as Pick<StampCapability, 'exportLibrary' | 'importLibrary' | 'onLibraryChanged'>;
  const emit = (change: StampLibraryChangedEvent) =>
    listeners.forEach((listener) => listener(change));
  return { stamp, bytes, emit };
}

/** A memory store that records its puts, and can hold one back until released. */
function countingStore() {
  const store = memoryStampStore();
  const puts: string[] = [];
  let held: { started: () => void; release: Promise<void> } | null = null;
  return {
    ...store,
    puts,
    async put(id: string, bytes: Uint8Array) {
      puts.push(id);
      const hold = held;
      held = null;
      if (hold) {
        hold.started();
        await hold.release;
      }
      await store.put(id, bytes);
    },
    /** The next put waits until `release()`; `started` resolves when it begins. */
    holdNextPut() {
      let started!: () => void;
      let release!: () => void;
      const startedPromise = new Promise<void>((resolve) => (started = resolve));
      held = { started, release: new Promise<void>((resolve) => (release = resolve)) };
      return { started: startedPromise, release };
    },
    async contents() {
      return (await store.list()).map((row) => [row.id, new TextDecoder().decode(row.bytes)]);
    },
  };
}

/** Lets every queued promise step run (the store work is promise steps, no timers). */
const idle = () => new Promise<void>((resolve) => setImmediate(resolve));

describe('stamp persistence helper', () => {
  it('saves a burst of changes once, deletes on removal, skips excluded libraries', async () => {
    const { stamp, bytes, emit } = fakeStamp();
    const store = countingStore();
    bytes.set('mine', new TextEncoder().encode('%PDF-mine-v1'));
    bytes.set('embedpdf-standard', new TextEncoder().encode('%PDF-std'));
    const stop = persistStampLibraries(stamp, store, { except: ['embedpdf-standard'] });

    emit({ libraryId: 'mine', reason: 'created' });
    emit({ libraryId: 'mine', reason: 'asset-added' });
    emit({ libraryId: 'embedpdf-standard', reason: 'imported' });
    await idle();
    expect(store.puts).toEqual(['mine']);
    expect(await store.contents()).toEqual([['mine', '%PDF-mine-v1']]);

    bytes.set('mine', new TextEncoder().encode('%PDF-mine-v2'));
    emit({ libraryId: 'mine', reason: 'asset-updated' });
    await idle();
    expect(await store.contents()).toEqual([['mine', '%PDF-mine-v2']]);

    emit({ libraryId: 'mine', reason: 'removed' });
    await idle();
    expect(await store.contents()).toEqual([]);
    stop();
  });

  it('changes made while a save runs are one more save after it', async () => {
    const { stamp, bytes, emit } = fakeStamp();
    const store = countingStore();
    bytes.set('mine', new TextEncoder().encode('%PDF-mine-v1'));
    persistStampLibraries(stamp, store);
    const firstPut = store.holdNextPut();

    emit({ libraryId: 'mine', reason: 'created' });
    await firstPut.started;
    bytes.set('mine', new TextEncoder().encode('%PDF-mine-v2'));
    emit({ libraryId: 'mine', reason: 'asset-added' });
    emit({ libraryId: 'mine', reason: 'asset-updated' });
    firstPut.release();
    await idle();
    expect(store.puts).toEqual(['mine', 'mine']);
    expect(await store.contents()).toEqual([['mine', '%PDF-mine-v2']]);
  });

  it('a removal during a save deletes after it, never under it', async () => {
    const { stamp, bytes, emit } = fakeStamp();
    const store = countingStore();
    bytes.set('mine', new TextEncoder().encode('%PDF-mine'));
    persistStampLibraries(stamp, store);
    const firstPut = store.holdNextPut();

    emit({ libraryId: 'mine', reason: 'created' });
    await firstPut.started;
    emit({ libraryId: 'mine', reason: 'asset-added' });
    emit({ libraryId: 'mine', reason: 'removed' }); // the latest wish wins
    firstPut.release();
    await idle();
    expect(store.puts).toEqual(['mine']);
    expect(await store.contents()).toEqual([]);
  });

  it('stopping keeps the work already asked for', async () => {
    const { stamp, bytes, emit } = fakeStamp();
    const store = countingStore();
    bytes.set('mine', new TextEncoder().encode('%PDF-mine'));
    const stop = persistStampLibraries(stamp, store);
    emit({ libraryId: 'mine', reason: 'created' });
    stop();
    emit({ libraryId: 'mine', reason: 'asset-added' }); // after the stop: not heard
    await idle();
    expect(store.puts).toEqual(['mine']);
  });

  it('restore imports every stored PDF and reports the ids the plugin assigned', async () => {
    const { stamp } = fakeStamp();
    const store = memoryStampStore();
    await store.put('a', new TextEncoder().encode('%PDF-lib-a'));
    await store.put('b', new TextEncoder().encode('%PDF-lib-b'));
    const restored = await restoreStampLibraries(stamp, store);
    expect(restored).toEqual(['lib-a', 'lib-b']);
    expect(stamp.importLibrary).toHaveBeenCalledTimes(2);
  });
});
