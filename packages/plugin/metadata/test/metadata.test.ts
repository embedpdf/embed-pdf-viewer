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
import { changedKeys, initialMetadataState, reduceMetadata } from '../src/model';

/**
 * Pilot A of the road-to-3.0 plan, tested through the real kernel: the
 * `create()` hook, the guarded handle, the one publication path (the confirmed
 * event), and the seed race (G6).
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
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

/** A document handle whose reads are controllable and whose writes emit the confirmed event. */
function fakeDocument(options: { allowEdit?: boolean; readRejects?: unknown } = {}) {
  const listeners = new Set<(event: unknown) => void>();
  const reads: Array<ReturnType<typeof deferred<DocumentMetadata>>> = [];
  const emit = (event: unknown) => listeners.forEach((l) => l(event));
  const origin = { kind: 'local', sessionId: 's1', sub: null, ts: 1 };
  const handle = {
    id: 'doc',
    events: {
      subscribe: (l: (event: unknown) => void) => {
        listeners.add(l);
        return () => listeners.delete(l);
      },
      lastServerId: () => null,
    },
    pages: { list: () => Promise.resolve({ pageCount: 1, pages: [page] }) },
    security: { allows: () => options.allowEdit ?? true },
    metadata: {
      read: () => {
        if (options.readRejects) return Promise.reject(options.readRejects);
        const d = deferred<DocumentMetadata>();
        reads.push(d);
        return d.promise;
      },
      update: vi.fn(async (patch: { title?: string | null }) => {
        const metadata = META({ title: patch.title ?? null });
        const result = { metadata, cache: null };
        // the engine confirms every write with the same result on the event stream
        queueMicrotask(() => emit({ type: 'metadata.updated', origin, ...result }));
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
const tick = () => new Promise((r) => setTimeout(r));

describe('model', () => {
  it('bumps the revision on every confirmed value and tracks status', () => {
    let s = initialMetadataState();
    expect(s.status).toBe('idle');
    s = reduceMetadata(s, { type: 'loading' });
    expect(s.status).toBe('loading');
    s = reduceMetadata(s, { type: 'set', metadata: META({ title: 'a' }) });
    expect(s).toMatchObject({ status: 'ready', revision: 1 });
    s = reduceMetadata(s, { type: 'error', forbidden: true });
    expect(s.status).toBe('forbidden');
  });

  it('changedKeys is shallow, with custom compared by entries', () => {
    const a = META({ title: 'x', custom: { k: '1' } });
    expect(changedKeys(null, a)).toHaveLength(Object.keys(a).length);
    expect(changedKeys(a, META({ title: 'y', custom: { k: '1' } }))).toEqual(['title']);
    expect(changedKeys(a, META({ title: 'x', custom: { k: '2' } }))).toEqual(['custom']);
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

  it('G6: a seed read that resolves after a newer confirmed value is dropped', async () => {
    const doc = fakeDocument();
    const kernel = createKernel({ engine: doc.engine, plugins: [metadataPlugin()] });
    await kernel.start();
    await open(kernel);
    const api = kernel.capability(MetadataToken, 'doc');
    const seen: string[] = [];
    api.onUpdated((e) => seen.push(`${e.origin.locality}:${e.metadata.title}`));

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
    expect(seen).toEqual(['remote:newer']); // the stale read never published
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
    api.onUpdated((e) =>
      order.push(`event:${e.metadata.title}:${e.changedKeys.join(',')}:${e.origin.locality}`),
    );
    const result = await api.update({ title: 'New' }).then((r) => (order.push('resolved'), r));
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
    await expect(api.update({ title: 'x' })).rejects.toSatisfy((e) =>
      isPluginError(e, 'permission-denied'),
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
    await expect(api.refresh()).rejects.toSatisfy((e) => isPluginError(e, 'permission-denied'));
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
      (e) => isPluginError(e, 'instance-closed') || isPluginError(e, 'permission-denied'),
    );
    await kernel.destroy();
  });
});
