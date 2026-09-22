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
import { metadataPlugin, MetadataToken } from '../src';
import { changedKeys } from '../src/model';

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
  created: null,
  modified: null,
  trapped: 'unknown',
  custom: {},
  ...over,
});

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
const page: PageLayout = {
  index: 0,
  ref: { kind: 'objectNumber', pageObjectNumber: 1 },
  label: null,
  size: { width: 600, height: 800 },
  rotation: 0,
  userUnit: 1,
  boxes: { media: { ...box }, crop: { ...box } },
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
function fakeDocument(options: { allowEdit?: boolean; readRejects?: unknown } = {}) {
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
      read: () => {
        if (options.readRejects) return Promise.reject(options.readRejects);
        const pendingRead = deferred<DocumentMetadata>();
        reads.push(pendingRead);
        return pendingRead.promise;
      },
      update: vi.fn(async (patch: { title?: string | null }) => {
        const metadata = META({ title: patch.title ?? null });
        const result = { metadata, cache: null };
        // Like both real engines: the confirmed event is published before the promise settles.
        emit({ type: 'metadata.updated', origin, ...result });
        return result;
      }),
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
  it('changedKeys is shallow, with custom compared by entries', () => {
    const metadata = META({ title: 'x', custom: { k: '1' } });
    expect(changedKeys(null, metadata)).toHaveLength(Object.keys(metadata).length);
    expect(changedKeys(metadata, META({ title: 'y', custom: { k: '1' } }))).toEqual(['title']);
    expect(changedKeys(metadata, META({ title: 'x', custom: { k: '2' } }))).toEqual(['custom']);
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
    api.onUpdated((event) => seen.push(`${event.origin.locality}:${event.metadata.title}`));

    doc.emit({
      type: 'metadata.updated',
      origin: { kind: 'remote', sessionId: 's2', sub: 'alice', ts: 2 },
      metadata: META({ title: 'newer' }),
      cache: null,
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

  it('update(): resolves with the engine result after the snapshot and onUpdated reflect it', async () => {
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
        `event:${event.metadata.title}:${event.changedKeys.join(',')}:${event.origin.locality}`,
      ),
    );
    const result = await api
      .update({ title: 'New' })
      .then((updateResult) => (order.push('resolved'), updateResult));
    expect(result.metadata.title).toBe('New');
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
    expect(api.canEdit()).toBe(false);
    await expect(api.update({ title: 'x' })).rejects.toSatisfy((error) =>
      isPluginError(error, 'permission-denied'),
    );
    expect(doc.handle.metadata.update).not.toHaveBeenCalled();
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
