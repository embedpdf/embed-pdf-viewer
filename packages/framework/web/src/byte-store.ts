/**
 * A bytes-by-id store over IndexedDB — the browser's answer to "keep these
 * blobs for me". Structurally the store port a plugin declares for its own
 * persistence (e.g. `StampLibraryStore` in `@embedpdf/plugin-stamp`); declared
 * here as a twin so this package stays plugin-free, per the layering law.
 *
 * IndexedDB rather than localStorage: a library or an image is binary, and a
 * localStorage string store caps at a few MB. One database, one object store,
 * keys are the caller's ids, values are the bytes as stored.
 */
export interface ByteStore {
  list(): Promise<Array<{ id: string; bytes: Uint8Array }>>;
  put(id: string, bytes: Uint8Array): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface IndexedDbByteStoreOptions {
  /** Object store name inside the database. Default `'bytes'`. */
  storeName?: string;
}

/** Open (creating on first use) one IndexedDB object store keyed by id. */
export function indexedDbByteStore(
  dbName: string,
  opts: IndexedDbByteStoreOptions = {},
): ByteStore {
  const storeName = opts.storeName ?? 'bytes';
  const open = (): Promise<IDBDatabase> =>
    new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains(storeName)) {
          request.result.createObjectStore(storeName);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error('indexedDB.open failed'));
    });
  const run = async <T>(
    mode: IDBTransactionMode,
    body: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const db = await open();
    try {
      return await new Promise<T>((resolve, reject) => {
        const request = body(db.transaction(storeName, mode).objectStore(storeName));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('indexedDB request failed'));
      });
    } finally {
      db.close();
    }
  };
  return {
    list: async () => {
      const keys = await run<IDBValidKey[]>('readonly', (store) => store.getAllKeys());
      const values = await run<Uint8Array[]>('readonly', (store) => store.getAll());
      return keys.map((key, i) => ({ id: String(key), bytes: new Uint8Array(values[i]) }));
    },
    put: (id, bytes) =>
      run('readwrite', (store) => store.put(new Uint8Array(bytes), id)).then(() => undefined),
    delete: (id) => run('readwrite', (store) => store.delete(id)).then(() => undefined),
  };
}
