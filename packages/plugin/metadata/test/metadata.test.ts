import { describe, expect, it, vi } from 'vitest';
import {
  createKernel,
  isPluginError,
  PermissionDenied,
  type DocumentHandle,
  type DocumentMetadata,
  type Engine,
  type PageLayout,
} from '@embedpdf/core';
import { metadataPlugin, metadataState, MetadataToken } from '../src';
import { changedKeys } from '../src/model';

/** A page whose every box is its crop box, in page space: measured from that box's top-left. */
const everyBoxIsTheCrop = (crop: { left: number; bottom: number; right: number; top: number }) => {
  const box = { x: 0, y: 0, width: crop.right - crop.left, height: crop.top - crop.bottom };
  return { media: box, crop: box, bleed: box, trim: box, art: box };
};

/**
 * The metadata plugin through the real kernel: the Info dict is a mirror that
 * changes only from loads and confirmed `metadata.updated` events, whoever
 * caused them, and a load that races a newer confirmed value never wins.
 */

const META = (over: Partial<DocumentMetadata> = {}): DocumentMetadata => ({
  title: null,
  author: null,
  subject: null,
  keywords: null,
  producer: null,
  creator: null,
  createdAt: null,
  modifiedAt: null,
  trapped: 'unknown',
  ...over,
});

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
const page: PageLayout = {
  index: 0,
  ref: { kind: 'objectNumber', objectNumber: 1 },
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: everyBoxIsTheCrop(box),
  pdfCropBox: { ...box },
} as PageLayout;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (event: unknown) => void;
  const promise = new Promise<T>((result, rej) => {
    resolve = result;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A document handle whose reads are controllable and whose writes emit the confirmed event. */
function fakeDocument(
  options: { allowEdit?: boolean; readRejects?: unknown; custom?: Record<string, string> } = {},
) {
  let customKeys: Record<string, string> = { ...options.custom };
  const listeners = new Set<(event: unknown) => void>();
  const reads: Array<ReturnType<typeof deferred<DocumentMetadata>>> = [];
  const emit = (event: unknown) => listeners.forEach((listener) => listener(event));
  const origin = { kind: 'local', sessionId: 's1', sub: null, ts: 1 };
  const handle = {
    id: 'doc',
    events: {
      subscribe: (listener: (event: unknown) => void) => {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    security: { allows: () => options.allowEdit ?? true },
    metadata: {
      get: () => {
        if (options.readRejects) return Promise.reject(options.readRejects);
        const pendingRead = deferred<DocumentMetadata>();
        reads.push(pendingRead);
        return pendingRead.promise;
      },
      update: vi.fn(async (patch: { title?: string | null }) => {
        const metadata = META({ title: patch.title ?? null });
        const result = { metadata, meta: { affectedPages: [], cacheDelta: null } };
        // Like both real engines: the confirmed event is published before the promise settles.
        emit({ type: 'metadata.updated', origin, ...result });
        return result;
      }),
      custom: {
        get: () => Promise.resolve({ ...customKeys }),
        update: vi.fn(async (patch: Record<string, string | null>) => {
          const next = { ...customKeys };
          for (const [key, value] of Object.entries(patch)) {
            if (value === null) delete next[key];
            else next[key] = value;
          }
          customKeys = next;
          const result = { custom: next, meta: { affectedPages: [], cacheDelta: null } };
          emit({ type: 'metadata.customUpdated', origin, ...result });
          return result;
        }),
      },
    },
    close: () => Promise.resolve(),
  } as unknown as DocumentHandle;
  const engine = {
    open: () => Promise.resolve(handle),
    destroy: () => Promise.resolve(),
  } as unknown as Engine;
  return { engine, handle, reads, emit };
}

const open = (kernel: ReturnType<typeof createKernel>) =>
  kernel.documents.open({ kind: 'bytes', id: 'doc', bytes: new Uint8Array() });
const tick = () => new Promise((resolve) => setTimeout(resolve));

describe('model', () => {
  it('changedKeys compares shallowly and counts removed keys', () => {
    const metadata = META({ title: 'x' });
    expect(changedKeys(null, metadata)).toHaveLength(Object.keys(metadata).length);
    expect(changedKeys(metadata, META({ title: 'y' }))).toEqual(['title']);
    expect(changedKeys({ a: '1', b: '2' }, { a: '1', c: '3' })).toEqual(['b', 'c']);
  });
});

describe('metadata controller', () => {
  it('seeds through load(): idle → loading → ready', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    expect(api.getStatus()).toBe('loading');
    expect(api.getSnapshot()).toBeNull();
    doc.reads[0].resolve(META({ title: 'seed' }));
    await tick();
    expect(api.getStatus()).toBe('ready');
    expect(api.getSnapshot()?.title).toBe('seed');
    expect(api.getSnapshot()).toBe(api.getSnapshot()); // reference-stable
    await kernel.destroy();
  });

  it('a load that resolves after a newer confirmed value keeps the newer value', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    const seen: string[] = [];
    api.onUpdated((event) => seen.push(`${event.origin.kind}:${event.metadata.title}`));

    doc.emit({
      type: 'metadata.updated',
      origin: { kind: 'remote', sessionId: 's2', sub: 'alice', ts: 2 },
      metadata: META({ title: 'newer' }),
      meta: { affectedPages: [], cacheDelta: null },
    });
    doc.reads[0].resolve(META({ title: 'stale' }));
    await tick();

    expect(api.getSnapshot()?.title).toBe('newer');
    expect(api.getStatus()).toBe('ready');
    expect(seen).toEqual(['remote:newer']); // the stale read never published a change
    await kernel.destroy();
  });

  it('announces loads as onResynced, never as onUpdated', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    const updated = vi.fn();
    const resynced = vi.fn();
    api.onUpdated(updated);
    api.onResynced(resynced);
    doc.reads[0].resolve(META({ title: 'seed' }));
    await tick();
    expect(resynced).toHaveBeenCalledWith({ metadata: META({ title: 'seed' }) });
    expect(updated).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('update(): resolves { metadata } after the snapshot and onUpdated reflect it', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    doc.reads[0].resolve(META());
    await tick();

    const order: string[] = [];
    api.onUpdated((event) =>
      order.push(
        `event:${event.metadata.title}:${event.changedKeys.join(',')}:${event.origin.kind}`,
      ),
    );
    const result = await api
      .update({ title: 'New' })
      .then((updateResult) => (order.push('resolved'), updateResult));
    expect(result).toEqual({ metadata: META({ title: 'New' }) });
    expect(api.getSnapshot()?.title).toBe('New');
    expect(order).toEqual(['event:New:title:local', 'resolved']);
    await kernel.destroy();
  });

  it('update() refuses without doc.metadata.modify, with the permission code', async () => {
    const doc = fakeDocument({ allowEdit: false });
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    expect(api.canUpdate()).toBe(false);
    await expect(api.update({ title: 'x' })).rejects.toMatchObject({
      code: 'permission-denied',
      permission: 'doc.metadata.modify',
    });
    expect(doc.handle.metadata.update).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('update() with a signal that already fired rejects operation-cancelled before the engine', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    const controller = new AbortController();
    controller.abort();
    await expect(api.update({ title: 'x' }, { signal: controller.signal })).rejects.toMatchObject({
      code: 'operation-cancelled',
    });
    await expect(
      api.custom.update({ k: 'v' }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: 'operation-cancelled' });
    expect(doc.handle.metadata.update).not.toHaveBeenCalled();
    expect(doc.handle.metadata.custom.update).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('refresh() stops waiting when its signal fires', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    const controller = new AbortController();
    const refreshing = api.refresh({ signal: controller.signal });
    controller.abort();
    await expect(refreshing).rejects.toMatchObject({ code: 'operation-cancelled' });
    await kernel.destroy();
  });

  it('a forbidden read reports status forbidden, and refresh() re-reads', async () => {
    const doc = fakeDocument({ readRejects: new PermissionDenied('doc.metadata.read') });
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    await tick();
    expect(api.getStatus()).toBe('forbidden');
    await expect(api.refresh()).rejects.toSatisfy((error) =>
      isPluginError(error, 'permission-denied'),
    );
    await kernel.destroy();
  });

  it('closing the document during a read leaves no dangling state and update rejects instance-closed', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    const closing = kernel.documents.close('doc');
    doc.reads[0].resolve(META({ title: 'late' }));
    await closing;
    await expect(api.update({ title: 'x' })).rejects.toSatisfy(
      (error) =>
        isPluginError(error, 'instance-closed') || isPluginError(error, 'permission-denied'),
    );
    await kernel.destroy();
  });
});

describe('custom metadata', () => {
  it('seeds its own snapshot, separate from the standard fields', async () => {
    const doc = fakeDocument({ custom: { reviewedBy: 'dana' } });
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    await tick();
    expect(api.custom.getStatus()).toBe('ready');
    expect(api.custom.getSnapshot()).toEqual({ reviewedBy: 'dana' });
    expect(api.getSnapshot()).toBeNull(); // the standard read is still pending
    await kernel.destroy();
  });

  it('update(): a key left out stays, null removes, and onUpdated names every changed key', async () => {
    const doc = fakeDocument({ custom: { reviewedBy: 'dana', draftOwner: 'sam', keep: 'me' } });
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    await tick();

    const order: string[] = [];
    api.custom.onUpdated((event) =>
      order.push(`event:${event.changedKeys.join(',')}:${event.origin.kind}`),
    );
    const standard = vi.fn();
    api.onUpdated(standard);
    const result = await api.custom
      .update({ reviewedBy: 'lee', draftOwner: null })
      .then((updateResult) => (order.push('resolved'), updateResult));

    expect(result).toEqual({ custom: { reviewedBy: 'lee', keep: 'me' } });
    expect(api.custom.getSnapshot()).toEqual({ reviewedBy: 'lee', keep: 'me' });
    expect(order).toEqual(['event:reviewedBy,draftOwner:local', 'resolved']);
    expect(standard).not.toHaveBeenCalled();
    await kernel.destroy();
  });

  it('update() refuses without doc.metadata.modify, like the standard fields', async () => {
    const doc = fakeDocument({ allowEdit: false });
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    await expect(api.custom.update({ k: 'v' })).rejects.toSatisfy((error) =>
      isPluginError(error, 'permission-denied'),
    );
    expect(doc.handle.metadata.custom.update).not.toHaveBeenCalled();
    await kernel.destroy();
  });
});

describe('metadataState', () => {
  it('reads the standard fields, the custom keys and the load state; empty without a document', async () => {
    expect(metadataState.empty).toEqual({ metadata: null, custom: null, status: 'idle' });
    const doc = fakeDocument({ custom: { contractId: 'C-1' } });
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    doc.reads[0].resolve(META({ title: 'seed' }));
    await tick();
    const state = metadataState.read(api);
    expect(state).toEqual({
      metadata: META({ title: 'seed' }),
      custom: { contractId: 'C-1' },
      status: 'ready',
    });
    // Reference-stable while nothing changed, so readers re-render only on a change.
    const again = metadataState.read(api);
    expect(again.metadata).toBe(state.metadata);
    expect(again.custom).toBe(state.custom);
    await kernel.destroy();
  });
});
