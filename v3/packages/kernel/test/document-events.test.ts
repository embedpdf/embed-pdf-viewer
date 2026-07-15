import { describe, expect, it, vi } from 'vitest';
import { AbortablePromise } from '@embedpdf/engine-core/runtime';
import type {
  DocumentEvent,
  DocumentHandle,
  Engine,
  PageLayout,
  PageRotation,
} from '@embedpdf/engine-core/runtime';
import { createKernel } from '../src/kernel';
import type { DocumentMeta, PluginContext } from '../src/types';

/**
 * Phase 1: document mutation events replace the in-kernel page registry.
 *
 * A fake engine whose handle exposes a controllable event stream lets us
 * emit a `pages.rotated` (or move/delete) event and assert the kernel swaps
 * `DocumentMeta.pages` in place and bumps `revision` — the signal every
 * document-scoped plugin (every Stage lens) keys its derivations on.
 */

const box = { left: 0, bottom: 0, right: 600, top: 800 } as const;
function page(pon: number, index: number, rotation: PageRotation = 0): PageLayout {
  return {
    index,
    pageObjectNumber: pon,
    label: null,
    size: { width: 600, height: 800 },
    rotation,
    userUnit: 1,
    boxes: { media: { ...box }, crop: { ...box } },
  };
}

/** A hand-driven event stream — `emit` pushes to every subscriber. */
class FakeEvents {
  private readonly listeners = new Set<(e: DocumentEvent) => void>();
  subscribe(listener: (e: DocumentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  lastServerId(): number | null {
    return null;
  }
  emit(event: DocumentEvent): void {
    for (const l of [...this.listeners]) l(event);
  }
  get subscriberCount(): number {
    return this.listeners.size;
  }
}

function fakeEngine(initialPages: PageLayout[]): { engine: Engine; events: FakeEvents } {
  const events = new FakeEvents();
  const handle = {
    id: 'doc-1',
    events,
    pages: {
      list: () =>
        AbortablePromise.resolveValue({ pageCount: initialPages.length, pages: initialPages }),
    },
    close: () => AbortablePromise.resolveValue<void>(undefined),
  } as unknown as DocumentHandle;
  const engine: Engine = {
    open: () => AbortablePromise.resolveValue(handle),
    destroy: () => AbortablePromise.resolveValue<void>(undefined),
  };
  return { engine, events };
}

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
    init: (ctx: PluginContext<unknown>) => {
      captured = ctx;
    },
  };
  return {
    plugin,
    ctx: () => {
      if (!captured) throw new Error('plugin not initialized');
      return captured;
    },
  };
}

function rotatedEvent(pons: number[], rotation: PageRotation, pages: PageLayout[]): DocumentEvent {
  return {
    type: 'pages.rotated',
    pageObjectNumbers: pons,
    rotation,
    layout: { pageCount: pages.length, pages },
    cache: null,
    origin: { kind: 'local', sessionId: 's', sub: null, ts: 1, serverId: null },
  };
}

describe('kernel: document events → page registry', () => {
  it('a pages.rotated event swaps the registry and bumps revision', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1), page(3, 2)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    const before = capture.ctx().document()!;
    expect(before.revision).toBe(0);
    expect(before.pages.map((p) => p.rotation)).toEqual([0, 0, 0]);

    // The engine confirmed a rotate; the event carries the new layout.
    events.emit(rotatedEvent([1], 90, [page(1, 0, 90), page(2, 1), page(3, 2)]));

    const after = capture.ctx().document()!;
    expect(after.revision).toBe(1); // registry version advanced
    expect(after.pages.find((p) => p.pageObjectNumber === 1)!.rotation).toBe(90);
    expect(after.pageCount).toBe(3); // rotate keeps the page set
    // Identity preserved: same pons, same order.
    expect(after.pages.map((p) => p.pageObjectNumber)).toEqual([1, 2, 3]);
  });

  it('a pages.deleted event shrinks the registry', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1), page(3, 2)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    events.emit({
      type: 'pages.deleted',
      pageObjectNumbers: [2],
      layout: { pageCount: 2, pages: [page(1, 0), page(3, 1)] },
      cache: null,
      origin: { kind: 'remote', sessionId: 'other', sub: 'alice', ts: 1, serverId: 7 },
    } as DocumentEvent);

    const after = capture.ctx().document()!;
    expect(after.revision).toBe(1);
    expect(after.pageCount).toBe(2);
    expect(after.pages.map((p) => p.pageObjectNumber)).toEqual([1, 3]);
  });

  it('an annotation event does NOT touch the registry (origin-agnostic, structure-only)', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    await kernel.documents.open({ kind: 'bytes', id: 'doc-1', bytes: new Uint8Array() });

    events.emit({
      type: 'annotation.created',
      pageObjectNumber: 1,
      created: {} as never,
      meta: {} as never,
      origin: { kind: 'local', sessionId: 's', sub: null, ts: 1, serverId: null },
    } as DocumentEvent);

    expect(capture.ctx().document()!.revision).toBe(0); // page registry untouched
  });

  it('closing the document unsubscribes — no leak, no post-close writes', async () => {
    const { engine, events } = fakeEngine([page(1, 0), page(2, 1)]);
    const capture = captureDoc();
    const kernel = createKernel({ engine, plugins: [capture.plugin] });
    const docId = await kernel.documents.open({
      kind: 'bytes',
      id: 'doc-1',
      bytes: new Uint8Array(),
    });
    expect(events.subscriberCount).toBe(1);

    await kernel.documents.close(docId);
    expect(events.subscriberCount).toBe(0); // teardown ran

    // A late event (e.g. a slow worker) must be a no-op, not a crash.
    expect(() => events.emit(rotatedEvent([1], 90, [page(1, 0, 90), page(2, 1)]))).not.toThrow();
    expect(kernel.documents.activeId()).toBeNull();
  });

  it('runs cleanup registered by a document capability when its document closes', async () => {
    const { engine } = fakeEngine([page(1, 0)]);
    const teardown = vi.fn();
    const token = { name: 'resource' };
    const plugin = {
      id: 'resource',
      scope: 'document' as const,
      token,
      capability: (ctx: PluginContext<unknown>) => {
        ctx.cleanup(teardown);
        return {};
      },
    };
    const kernel = createKernel({ engine, plugins: [plugin] });
    const docId = await kernel.documents.open({
      kind: 'bytes',
      id: 'doc-1',
      bytes: new Uint8Array(),
    });
    kernel.capability(token, docId);

    await kernel.documents.close(docId);

    expect(teardown).toHaveBeenCalledTimes(1);
  });

  it('runs cleanup registered by a workspace capability when the kernel is destroyed', () => {
    const { engine } = fakeEngine([]);
    const teardown = vi.fn();
    const token = { name: 'workspace-resource' };
    const plugin = {
      id: 'workspace-resource',
      token,
      capability: (ctx: PluginContext<unknown>) => {
        ctx.cleanup(teardown);
        return {};
      },
    };
    const kernel = createKernel({ engine, plugins: [plugin] });

    kernel.destroy();

    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
