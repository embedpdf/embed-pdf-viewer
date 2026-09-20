import { afterEach, describe, expect, it } from 'vitest';

import { indexedDbByteStore } from '../src/byte-store';

/**
 * The smallest IndexedDB that exercises the adapter's wiring: open with
 * upgrade, one object store, put/getAll/getAllKeys/delete, request callbacks
 * fired asynchronously the way the real API does.
 */
function installFakeIndexedDb() {
  const databases = new Map<string, Map<string, Map<IDBValidKey, unknown>>>();
  const request = <T>(produce: () => T) => {
    const req: any = { onsuccess: null, onerror: null, result: undefined, error: null };
    queueMicrotask(() => {
      try {
        req.result = produce();
        req.onsuccess?.();
      } catch (error) {
        req.error = error;
        req.onerror?.();
      }
    });
    return req;
  };
  const objectStore = (rows: Map<IDBValidKey, unknown>) => ({
    put: (value: unknown, key: IDBValidKey) => request(() => (rows.set(key, value), key)),
    delete: (key: IDBValidKey) => request(() => void rows.delete(key)),
    getAll: () => request(() => [...rows.values()]),
    getAllKeys: () => request(() => [...rows.keys()]),
  });
  (globalThis as any).indexedDB = {
    open(name: string) {
      const req: any = { onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        let stores = databases.get(name);
        const fresh = !stores;
        if (!stores) databases.set(name, (stores = new Map()));
        const db = {
          objectStoreNames: { contains: (s: string) => stores!.has(s) },
          createObjectStore: (s: string) => void stores!.set(s, new Map()),
          transaction: (s: string) => ({
            objectStore: () => {
              const rows = stores!.get(s);
              if (!rows) throw new Error(`NotFoundError: ${s}`);
              return objectStore(rows);
            },
          }),
          close: () => {},
        };
        req.result = db;
        if (fresh) req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    },
  };
  return () => {
    delete (globalThis as any).indexedDB;
  };
}

describe('indexedDbByteStore', () => {
  let restore: () => void = () => {};
  afterEach(() => restore());

  it('round-trips bytes by id, lists in key order, and deletes', async () => {
    restore = installFakeIndexedDb();
    const store = indexedDbByteStore('test-db', { storeName: 'blobs' });
    await store.put('b', new Uint8Array([2]));
    await store.put('a', new Uint8Array([1, 1]));
    expect((await store.list()).map((row) => [row.id, [...row.bytes]])).toEqual([
      ['b', [2]],
      ['a', [1, 1]],
    ]);
    await store.delete('b');
    expect((await store.list()).map((row) => row.id)).toEqual(['a']);
  });

  it('surfaces a missing object store as a rejection, not a hang', async () => {
    restore = installFakeIndexedDb();
    await indexedDbByteStore('test-db2', { storeName: 'one' }).put('x', new Uint8Array());
    await expect(indexedDbByteStore('test-db2', { storeName: 'other' }).list()).rejects.toThrow(
      /NotFoundError/,
    );
  });
});
