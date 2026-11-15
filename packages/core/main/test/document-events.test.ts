import { toPageRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';
import { AbortablePromise } from '@embedpdf/engine-core/runtime';
import type {
  DocumentEvent,
  DocumentHandle,
  Engine,
  PageLayout,
  PdfRotation,
} from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import type { DocumentMeta, PluginContext } from '../src/types';
import { pageSpaceBoxesOf } from '@embedpdf/engine-core/runtime';

/**
 * Document mutation events drive the kernel's page list; there is no separate
 * in-kernel page registry.
 *
 * A fake engine whose handle exposes a controllable event stream lets us
 * emit a `pages.rotated` (or move/delete) event and assert the kernel swaps
 * `DocumentMeta.pages` in place and bumps `pagesSequence` — the signal every
 * document-scoped plugin (every Stage lens) keys its derivations on.
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
function page(pageObjectNumber: number, index: number, rotation: PdfRotation = 0): PageLayout {
  return {
    index,
    ref: toPageRef(pageObjectNumber),
    label: null,
    size: { width: 600, height: 800 },
    rotation,
    userUnit: 1,
    tabOrder: null,
    boxes: pageSpaceBoxesOf({
      media: { ...box },
      crop: { ...box },
      bleed: { ...box },
      trim: { ...box },
      art: { ...box },
    }),
    pdfCropBox: { ...box },
  };
}

/** A hand-driven event stream — `emit` pushes to every subscriber. */
class FakeEvents {
  private readonly listeners = new Set<(event: DocumentEvent) => void>();
  subscribe(listener: (event: DocumentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  lastServerSequence(): number | null {
    return null;
  }
  emit(event: DocumentEvent): void {
    for (const listener of [...this.listeners]) listener(event);
  }
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

function fakeEngine(initialPages: PageLayout[]) {
  const events = new FakeEvents();
  let listed = initialPages;
  /** While set, a read of the pages waits until the test answers it. */
  let held: (() => void)[] | null = null;
  const handle = {
    id: 'doc-1',
    events,
    pages: {
      list: () => {
        const snapshot = { pageCount: listed.length, labels: [], pages: listed };
        const waiting = held;
        if (!waiting) return AbortablePromise.resolveValue(snapshot);
        return new Promise((resolve) => waiting.push(() => resolve(snapshot)));
      },
    },
    close: () => AbortablePromise.resolveValue<void>(undefined),
  } as unknown as DocumentHandle;
  const engine: Engine = {
    canOpenFiles: true,
    open: () => AbortablePromise.resolveValue(handle),
    destroy: () => AbortablePromise.resolveValue<void>(undefined),
  };
  return {
    engine,
    events,
    /** The pages the engine holds from now on: what a read of them answers. */
    setPages: (pages: PageLayout[]) => {
      listed = pages;
    },
    /** Hold the reads of the pages; the function it returns answers them, the last one first. */
    holdReads: () => {
      const waiting: (() => void)[] = [];
      held = waiting;
      return () => {
        held = null;
        for (const answer of [...waiting].reverse()) answer();
      };
    },
  };
}

const desynced: DocumentEvent = {
  type: 'stream.desynced',
  reason: 'unknown-change',
  at: new Date(1).toISOString(),
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/** A document-scoped plugin that just captures its context, so the test can
 *  read `ctx.document()` exactly as a real plugin (e.g. a Stage lens) sees it. */
function captureDoc(): {
  plugin: import('../src/types').AnyPlugin;
  ctx: () => PluginContext<unknown>;
} {
  let captured: PluginContext<unknown> | null = null;
  const plugin = {
    id: 'capture',
    scope: 'document' as const,
    create: (ctx: PluginContext<unknown>) => {
      captured = ctx;
      return { api: {} };
    },
  };
  return {
    plugin,
    ctx: () => {
      if (!captured) throw new Error('plugin not created');
      return captured;
    },
  };
}

function rotatedEvent(
  pageObjectNumbers: number[],
  rotation: PdfRotation,
  pages: PageLayout[],
): DocumentEvent {
  return {
    type: 'pages.rotated',
    pages: pageObjectNumbers.map((pageObjectNumber) => toPageRef(pageObjectNumber)),
    rotation,
    layout: { pageCount: pages.length, pages, labels: [], namedPages: [] },
    meta: { affectedPages: [], cacheDelta: null, opId: 'op-1', undoable: true },
    origin: {
      kind: 'local',
      sessionId: 's',
      subject: null,
      at: new Date(1).toISOString(),
      serverSequence: null,
    },
  };
}

describe('kernel: document events → page registry', () => {
  it('a pages.rotated event swaps the registry and bumps revision', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1), page(3, 2)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    const before = capture.ctx().document()!;
    expect(before.pagesSequence).toBe(0);
    expect(before.pages.map((pageInfo) => pageInfo.rotation)).toEqual([0, 0, 0]);

    // The engine confirmed a rotate; the event carries the new layout.
    events.emit(rotatedEvent([1], 90, [page(1, 0, 90), page(2, 1), page(3, 2)]));

    const after = capture.ctx().document()!;
    expect(after.pagesSequence).toBe(1); // registry version advanced
    expect(after.pages.find((pageInfo) => pageInfo.ref.objectNumber === 1)!.rotation).toBe(90);
    expect(after.pageCount).toBe(3); // rotate keeps the page set
    // Identity preserved: same pages, same order.
    expect(after.pages.map((pageInfo) => pageInfo.ref.objectNumber)).toEqual([1, 2, 3]);
  });

  it('a pages.deleted event shrinks the registry', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1), page(3, 2)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    events.emit({
      type: 'pages.deleted',
      pages: [toPageRef(2)],
      layout: { pageCount: 2, pages: [page(1, 0), page(3, 1)], labels: [], namedPages: [] },
      meta: { affectedPages: [], cacheDelta: null, opId: 'op-1', undoable: true },
      origin: {
        kind: 'remote',
        sessionId: 'other',
        subject: 'alice',
        at: new Date(1).toISOString(),
        serverSequence: 7,
      },
    } as DocumentEvent);

    const after = capture.ctx().document()!;
    expect(after.pagesSequence).toBe(1);
    expect(after.pageCount).toBe(2);
    expect(after.pages.map((pageInfo) => pageInfo.ref.objectNumber)).toEqual([1, 3]);
  });

  it('a stream that skipped events has the pages read again', async () => {
    const { engine, events, setPages } = fakeEngine([page(1, 0), page(2, 1), page(3, 2)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    // Someone deleted a page, and the stream never told: its row was skipped.
    setPages([page(1, 0), page(3, 1)]);
    events.emit(desynced);
    expect(capture.ctx().document()!.pageCount).toBe(3);
    await tick();

    const after = capture.ctx().document()!;
    expect(after.pagesSequence).toBe(1);
    expect(after.pages.map((pageInfo) => pageInfo.ref.objectNumber)).toEqual([1, 3]);
  });

  it('a page event that arrives while the pages are read again wins over the read', async () => {
    const { engine, events, setPages, holdReads } = fakeEngine([
      page(1, 0),
      page(2, 1),
      page(3, 2),
    ]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });
    const pagesNow = () =>
      capture
        .ctx()
        .document()!
        .pages.map((pageInfo) => pageInfo.ref.objectNumber);

    const answer = holdReads();
    setPages([page(1, 0), page(3, 1)]);
    events.emit(desynced);
    // A later delete arrives as an event before the read is answered.
    events.emit({
      type: 'pages.deleted',
      pages: [toPageRef(3)],
      layout: { pageCount: 1, pages: [page(1, 0)], labels: [], namedPages: [] },
      meta: { affectedPages: [], cacheDelta: null, opId: 'op-2', undoable: true },
      origin: {
        kind: 'remote',
        sessionId: 'other',
        subject: 'alice',
        at: new Date(2).toISOString(),
        serverSequence: 9,
      },
    } as DocumentEvent);
    expect(pagesNow()).toEqual([1]);
    answer();
    await tick();
    expect(pagesNow()).toEqual([1]);

    // Of two reads only the last counts, though the first is answered after it.
    const answerBoth = holdReads();
    setPages([page(1, 0), page(4, 1)]);
    events.emit(desynced);
    setPages([page(1, 0), page(4, 1), page(5, 2)]);
    events.emit(desynced);
    answerBoth();
    await tick();
    expect(pagesNow()).toEqual([1, 4, 5]);
  });

  it('an annotation event does NOT touch the registry (origin-agnostic, structure-only)', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    events.emit({
      type: 'annotations.created',
      page: toPageRef(1),
      annotation: {} as never,
      meta: {} as never,
      origin: {
        kind: 'local',
        sessionId: 's',
        subject: null,
        at: new Date(1).toISOString(),
        serverSequence: null,
      },
    } as DocumentEvent);

    expect(capture.ctx().document()!.pagesSequence).toBe(0); // page registry untouched
  });

  it('closing the document unsubscribes — no leak, no post-close writes', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    const {
      document: { id: docId },
    } = await kernel.documents.open({
      kind: 'bytes',
      id: 'doc-1',
      bytes: new Uint8Array(),
    });
    // The kernel listens first and last: one change's events land as one store update.
    expect(events.subscriberCount).toBe(2);

    await kernel.documents.close(docId);
    expect(events.subscriberCount).toBe(0); // teardown ran

    // A late event (e.g. a slow worker) must be a no-op, not a crash.
    expect(() => events.emit(rotatedEvent([1], 90, [page(1, 0, 90), page(2, 1)]))).not.toThrow();
    expect(kernel.documents.getActiveId()).toBeNull();
  });

  it('runs cleanup registered by a document capability when its document closes', async () => {
    const { engine } = fakeEngine([page(1, 0)]);
    const teardown = vi.fn();
    const token = { name: 'resource' };
    const plugin = {
      id: 'resource',
      scope: 'document' as const,
      token,
      create: (ctx: PluginContext<unknown>) => {
        ctx.cleanup(teardown);
        return { api: {} };
      },
    };
    const kernel = createKernel({ engine, plugins: [plugin] });
    const {
      document: { id: docId },
    } = await kernel.documents.open({
      kind: 'bytes',
      id: 'doc-1',
      bytes: new Uint8Array(),
    });
    kernel.capability(token, docId);

    await kernel.documents.close(docId);

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup registered by a workspace capability when the kernel is destroyed', async () => {
    const { engine } = fakeEngine([]);
    const teardown = vi.fn();
    const token = { name: 'workspace-resource' };
    const plugin = {
      id: 'workspace-resource',
      token,
      create: (ctx: PluginContext<unknown>) => {
        ctx.cleanup(teardown);
        return { api: {} };
      },
    };
    const kernel = createKernel({ engine, plugins: [plugin] });

    await kernel.destroy();

    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
