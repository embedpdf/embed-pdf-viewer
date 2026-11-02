import { describe, expect, it, vi } from 'vitest';
import {
  restoredPagesOf,
  toPageRef,
  type Change,
  type ChangeResult,
  type DocumentEvent,
  type PageLayout,
} from '@embedpdf/engine-core/runtime';

import { createTestContext } from '../src/testing';

/**
 * The page list is a view: the engine's pages with this session's pending
 * page changes on top. A page change shows at once and leaves the view as
 * the engine answers; an answer the prediction got right changes nothing; a
 * refusal takes it back; another session's change lands under the pending
 * ones; and a page mirror reads a page a pending change makes once the
 * engine has it.
 */

interface Deferred<T> {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: unknown): void;
}
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

const [ONE, TWO, THREE] = [1, 2, 3].map(toPageRef) as [
  ReturnType<typeof toPageRef>,
  ReturnType<typeof toPageRef>,
  ReturnType<typeof toPageRef>,
];

const origin = (kind: 'local' | 'remote', id?: string) => ({
  kind,
  sessionId: kind === 'local' ? 'me' : 'them',
  sub: null,
  ts: 0,
  serverId: null,
  ...(id ? { tx: { id, index: 0, count: 1 } } : {}),
});

/** The engine's pages as a layout event carries them. */
const layoutEvent = (
  type: 'pages.reordered' | 'pages.rotated' | 'pages.deleted' | 'pages.inserted',
  pages: readonly PageLayout[],
  from: ReturnType<typeof origin>,
): DocumentEvent =>
  ({
    type,
    pages: [],
    layout: {
      pageCount: pages.length,
      pages: pages.map((page, index) => ({ ...page, index })),
      labels: [],
      namedPages: [],
    },
    origin: from,
  }) as unknown as DocumentEvent;

const resultOf = (opId: string): ChangeResult => ({
  items: [],
  meta: { affectedPages: [], cacheDelta: null, opId, undoable: true },
});

/** A document of three pages whose `apply` answers when the test says. */
function harness() {
  const calls: { change: Change; opId: string; answer: Deferred<ChangeResult> }[] = [];
  const apply = vi.fn((change: Change, options?: { opId?: string }) => {
    const answer = deferred<ChangeResult>();
    calls.push({ change, opId: options!.opId!, answer });
    return Object.assign(answer.promise, { abort: vi.fn() });
  });
  const ctx = createTestContext({
    pages: [{ ref: ONE }, { ref: TWO, rotation: 90 }, { ref: THREE }],
    doc: { apply } as never,
  });
  /** Answer a call as both engines do: its events first, then the result. */
  const answer = (index: number, events: (opId: string) => DocumentEvent[]) => {
    const call = calls[index]!;
    for (const event of events(call.opId)) ctx.emitDocumentEvent(event);
    call.answer.resolve(resultOf(call.opId));
  };
  const order = () => ctx.document()!.pages.map((page) => page.ref.objectNumber);
  return { ctx, calls, answer, order };
}

describe('the page list', () => {
  it('shows a page change at once, and an answer that matches it changes nothing', async () => {
    const { ctx, answer, order } = harness();
    const revision = ctx.document()!.revision;

    ctx.changes.stage({
      label: { key: 'pages.reorder' },
      ops: [{ type: 'pages.reorder', pages: [THREE], position: 'start' }],
    });
    expect(order()).toEqual([3, 1, 2]);
    expect(ctx.document()!.pages.map((page) => page.index)).toEqual([0, 1, 2]);
    expect(ctx.document()!.revision).toBe(revision + 1);
    // An index names the page the user sees.
    expect(ctx.pageOf(0).ref).toEqual(THREE);

    const shown = ctx.document()!.pages;
    answer(0, (opId) => [layoutEvent('pages.reordered', shown, origin('local', opId))]);
    await tick();
    expect(ctx.document()!.pages).toBe(shown);
    expect(ctx.document()!.revision).toBe(revision + 1);
  });

  it('takes a refused page change back', async () => {
    const { ctx, calls, order } = harness();
    ctx.changes.stage({
      label: { key: 'pages.delete' },
      ops: [{ type: 'pages.delete', pages: [TWO] }],
    });
    expect(order()).toEqual([1, 3]);

    calls[0]!.answer.reject(new Error('locked'));
    await tick();
    expect(order()).toEqual([1, 2, 3]);
    expect(ctx.document()!.pages[1]!.rotation).toBe(90);
  });

  it("puts another session's page change under the pending ones", async () => {
    const { ctx, order } = harness();
    ctx.changes.stage({
      label: { key: 'pages.rotate' },
      ops: [{ type: 'pages.rotate', pages: [ONE], rotation: 180 }],
    });
    const engine = ctx
      .document()!
      .pages.map((page) =>
        page.ref.objectNumber === 1 ? { ...page, rotation: 0 as const } : page,
      );
    ctx.emitDocumentEvent(
      layoutEvent('pages.reordered', [engine[2]!, engine[0]!, engine[1]!], origin('remote')),
    );
    expect(order()).toEqual([3, 1, 2]);
    expect(ctx.getPage(ONE)!.rotation).toBe(180);
  });

  it('shows blank pages before the engine has them, named pending', async () => {
    const { ctx, answer, order } = harness();
    ctx.changes.stage({
      label: { key: 'pages.insertBlank' },
      ops: [
        {
          type: 'pages.insertBlank',
          spec: { size: { width: 300, height: 200 } },
          position: { after: ONE },
          objectNumbers: [40],
        },
      ],
    });
    expect(order()).toEqual([1, 40, 2, 3]);
    expect(ctx.getPage(toPageRef(40))!.size).toEqual({ width: 300, height: 200 });
    expect([...ctx.document()!.pendingPages]).toEqual([[40, { look: 'blank' }]]);

    const shown = ctx.document()!.pages;
    answer(0, (opId) => [layoutEvent('pages.inserted', shown, origin('local', opId))]);
    await tick();
    expect(ctx.document()!.pages).toBe(shown);
    expect(ctx.document()!.pendingPages.size).toBe(0);
  });

  it('shows a copy at once, pending as a copy of its page', () => {
    const { ctx, order } = harness();
    ctx.changes.stage({
      label: { key: 'pages.duplicate' },
      ops: [{ type: 'pages.copy', pages: [TWO], position: { after: ONE }, objectNumbers: [40] }],
    });
    expect(order()).toEqual([1, 40, 2, 3]);
    expect(ctx.getPage(toPageRef(40))!.rotation).toBe(90);
    expect(ctx.document()!.pendingPages.get(40)).toEqual({ look: 'copy', of: TWO });
  });

  it('moves the labels with the pages as the engine does, and an undo puts them back', () => {
    const labels = [
      { firstPage: 0, style: 'lowerRoman' as const, firstNumber: 1, prefix: '' },
      { firstPage: 1, style: 'decimal' as const, firstNumber: 1, prefix: '' },
    ];
    const ctx = createTestContext({
      pages: [
        { ref: ONE, label: 'i' },
        { ref: TWO, label: '1' },
        { ref: THREE, label: '2' },
      ],
      pageLabels: labels,
      doc: { apply: () => new Promise(() => {}) } as never,
    });
    const shown = () => ctx.document()!.pages.map((page) => page.label);
    // The body's first page goes: the body starts on its next page.
    ctx.changes.stage({
      label: { key: 'pages.delete' },
      ops: [{ type: 'pages.delete', pages: [TWO] }],
    });
    expect(shown()).toEqual(['i', '1']);
    // A page inserted before the body takes the front matter's numbering.
    ctx.changes.stage({
      label: { key: 'pages.insertBlank' },
      ops: [
        {
          type: 'pages.insertBlank',
          spec: { size: { width: 100, height: 100 } },
          position: { after: ONE },
          objectNumbers: [40],
        },
      ],
    });
    expect(shown()).toEqual(['i', 'ii', '1']);
    // An undo that puts the sections back shows them so.
    ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: 'the-delete',
      shows: [{ type: 'pages.relabel', labels }],
    });
    expect(ctx.document()!.pageLabels).toEqual(labels);
    expect(shown()).toEqual(['i', '1', '2']);
  });

  it('shows deleted pages back at once when an undo restores them', async () => {
    const { ctx, order } = harness();
    const before = ctx.document()!.pages;
    const engine = before.filter((page) => page.ref.objectNumber !== 2);
    ctx.emitDocumentEvent(layoutEvent('pages.deleted', engine, origin('local')));
    expect(order()).toEqual([1, 3]);

    ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: 'the-delete',
      shows: [{ type: 'pages.restore', pages: restoredPagesOf(before, [TWO]) }],
    });
    expect(order()).toEqual([1, 2, 3]);
    expect(ctx.getPage(TWO)!.rotation).toBe(90);
    expect(ctx.document()!.pendingPages.get(2)).toEqual({ look: 'own' });
  });
});

describe('a page mirror', () => {
  const mirrored = () => {
    const h = harness();
    const load = vi.fn(async () => 'read');
    const mirror = h.ctx.pageMirror<string>({ name: 'notes', load, affected: () => null });
    h.ctx.connect({ api: {} });
    h.ctx.changes.stage({
      label: { key: 'pages.insertBlank' },
      ops: [
        {
          type: 'pages.insertBlank',
          spec: { size: { width: 300, height: 200 } },
          objectNumbers: [40],
        },
      ],
    });
    return { ...h, load, mirror };
  };

  it('reads a page a pending change makes once the engine has it', async () => {
    const { ctx, answer, load, mirror } = mirrored();
    const loading = mirror.ensureLoaded(toPageRef(40));
    await tick();
    expect(load).not.toHaveBeenCalled();
    expect(mirror.getStatus(toPageRef(40))).toBe('loading');

    const shown = ctx.document()!.pages;
    answer(0, (opId) => [layoutEvent('pages.inserted', shown, origin('local', opId))]);
    await loading;
    expect(load).toHaveBeenCalledTimes(1);
    expect(mirror.get(toPageRef(40))).toBe('read');
  });

  it('forgets a page the engine refused to make, without reading it', async () => {
    const { calls, load, mirror } = mirrored();
    const loading = mirror.ensureLoaded(toPageRef(40));
    calls[0]!.answer.reject(new Error('refused'));
    await loading;
    expect(load).not.toHaveBeenCalled();
    expect(mirror.getStatus(toPageRef(40))).toBe('idle');
  });
});
