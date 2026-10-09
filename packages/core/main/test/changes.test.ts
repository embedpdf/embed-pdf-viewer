import { describe, expect, it, vi } from 'vitest';
import {
  toPageRef,
  type Change,
  type ChangeOp,
  type ChangeResult,
  type DocumentEvent,
  type PageRef,
} from '@embedpdf/engine-core/runtime';

import {
  reload,
  type Mirror,
  type MirrorReload,
  type PageMirror,
  type PredictedOp,
} from '../src/index';
import { createTestContext } from '../src/testing';

/**
 * The change queue and the mirrors' views: a change shows at once and is sent
 * in staging order; the views replay it over a truth that moves; it leaves a
 * view once that mirror holds the answer (an exact fold, a page read, a failed
 * read and a later load); a refusal takes its dependents with it; holds and
 * groups; and one store update per change.
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

const page = toPageRef(1);
const ref = (objectNumber: number) => ({ kind: 'objectNumber' as const, page, objectNumber });

/** Each note's text, by object number. */
type Notes = Readonly<Record<number, string>>;

const write = (objectNumber: number, contents: string): ChangeOp => ({
  type: 'annotations.update',
  ref: ref(objectNumber),
  patch: { contents },
});
const create = (objectNumber: number, contents: string): ChangeOp =>
  ({
    type: 'annotations.create',
    page,
    objectNumber,
    data: { subtype: 'text', contents },
  }) as ChangeOp;

/** What the engine does with the ops: the prediction, as a mirror's `predict` would. */
function predictNotes(notes: Notes, op: PredictedOp): Notes {
  switch (op.type) {
    case 'annotations.update': {
      const contents = (op.patch as { contents?: string }).contents;
      if (contents === undefined || op.ref.kind !== 'objectNumber') return notes;
      const objectNumber = op.ref.objectNumber;
      return notes[objectNumber] === contents ? notes : { ...notes, [objectNumber]: contents };
    }
    case 'annotations.create': {
      if (op.objectNumber === undefined) return notes;
      const contents = (op.data as { contents?: string }).contents ?? '';
      return { ...notes, [op.objectNumber]: contents };
    }
    default:
      return notes;
  }
}

const origin = (kind: 'local' | 'remote', tx?: { id: string; index: number; count: number }) => ({
  kind,
  sessionId: kind === 'local' ? 'me' : 'them',
  sub: null,
  ts: 0,
  serverId: null,
  ...(tx ? { tx } : {}),
});

/** A note's new text, as the engine publishes it. */
const updated = (
  objectNumber: number,
  contents: string,
  from: ReturnType<typeof origin>,
): DocumentEvent =>
  ({
    type: 'annotations.updated',
    page,
    annotation: { ref: ref(objectNumber), page, contents },
    origin: from,
  }) as unknown as DocumentEvent;

const foldNotes = (notes: Notes, event: DocumentEvent): Notes => {
  if (event.type !== 'annotations.updated') return notes;
  const { ref: annotationRef, contents } = event.annotation as unknown as {
    ref: { objectNumber: number };
    contents: string;
  };
  return { ...notes, [annotationRef.objectNumber]: contents };
};

const resultOf = (opId: string): ChangeResult => ({
  items: [],
  meta: { affectedPages: [page], cacheDelta: null, opId, undoable: true },
});

/** A document whose `apply` answers when the test says, recording every call. */
function harness(
  options: {
    fold?: (notes: Notes, event: DocumentEvent) => Notes | MirrorReload;
    pageReads?: boolean;
  } = {},
) {
  const calls: {
    change: Change;
    opId: string;
    answer: Deferred<ChangeResult>;
    abort: ReturnType<typeof vi.fn>;
  }[] = [];
  const apply = vi.fn((change: Change, writeOptions?: { opId?: string }) => {
    const answer = deferred<ChangeResult>();
    const abort = vi.fn();
    calls.push({ change, opId: writeOptions!.opId!, answer, abort });
    return Object.assign(answer.promise, { abort });
  });
  const pool = [40, 41, 42];
  const loads: Deferred<Notes>[] = [];
  const pageLoads: Deferred<(value: Notes) => Notes>[] = [];
  const ctx = createTestContext({
    doc: {
      apply,
      objectNumbers: {
        take: () => pool.shift() ?? null,
        get held() {
          return pool.length;
        },
        reserve: vi.fn(),
        onLost: () => () => {},
      },
    } as never,
  });
  const notes: Mirror<Notes> = ctx.mirror<Notes>({
    name: 'notes',
    initial: () => ({ 1: 'one', 2: 'two' }),
    load: async () => {
      const read = deferred<Notes>();
      loads.push(read);
      return { value: await read.promise };
    },
    fold: options.fold ?? foldNotes,
    predict: predictNotes,
    ...(options.pageReads
      ? {
          loadPages: async () => {
            const read = deferred<(value: Notes) => Notes>();
            pageLoads.push(read);
            return read.promise;
          },
        }
      : {}),
  });
  /** Answer a call: its events first, as both engines publish them, then the result. */
  const answer = (index: number, events: (opId: string) => DocumentEvent[] = () => []) => {
    const call = calls[index]!;
    for (const event of events(call.opId)) ctx.emitDocumentEvent(event);
    call.answer.resolve(resultOf(call.opId));
  };
  return { ctx, notes, calls, apply, loads, pageLoads, answer };
}

/** A harness whose notes mirror has loaded `{ 1: 'one', 2: 'two' }`. */
async function loaded(options?: Parameters<typeof harness>[0]) {
  const h = harness(options);
  h.ctx.connect({ api: {} });
  h.loads[0]!.resolve({ 1: 'one', 2: 'two' });
  await tick();
  return h;
}

const own = (opId: string, index = 0, count = 1) => origin('local', { id: opId, index, count });

describe('a staged change', () => {
  it('shows at once, and is sent in staging order', async () => {
    const { ctx, notes, calls } = await loaded();
    const first = ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(2, 'dos')] });
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'dos' });
    expect(notes.get()).toEqual({ 1: 'one', 2: 'two' });
    expect(calls.map((call) => call.change)).toEqual([
      { ops: [write(1, 'uno')] },
      { ops: [write(2, 'dos')] },
    ]);
    expect(calls[0]!.opId).toBe(first.opId);
    expect(ctx.changes.pending()).toHaveLength(2);
  });

  it('replays over a truth that moves: another session, then my own answer', async () => {
    const { ctx, notes, answer } = await loaded();
    const mine = ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });

    // Someone else changes both notes: mine stays on top of theirs.
    ctx.emitDocumentEvent(updated(1, 'theirs', origin('remote')));
    ctx.emitDocumentEvent(updated(2, 'zwei', origin('remote')));
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'zwei' });

    // My events fold before my answer: the view already equals the truth (absolute replay).
    answer(0, (opId) => [updated(1, 'uno', own(opId))]);
    expect(notes.get()).toEqual({ 1: 'uno', 2: 'zwei' });
    expect(notes.view()).toEqual(notes.get());
    await expect(mine.result).resolves.toMatchObject({ meta: { opId: mine.opId } });
    expect(ctx.changes.hasPending()).toBe(false);
    expect(notes.view()).toBe(notes.get());
  });

  it('an undo names the change it undoes, and shows its prediction until answered', async () => {
    const { ctx, notes, calls, answer } = await loaded();
    const forward = ctx.changes.stage({
      label: { key: 'note.edit' },
      ops: [write(1, 'uno')],
      undo: [write(1, 'one')],
    });
    answer(0, (opId) => [updated(1, 'uno', own(opId))]);
    await tick();
    const undo = ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: forward.opId,
      shows: [write(1, 'one')],
    });
    expect(forward.undoOf).toBeNull();
    expect(undo.undoOf).toBe(forward.opId);
    expect(calls[1]!.change).toEqual({ undoOf: forward.opId });
    expect(notes.view()).toEqual({ 1: 'one', 2: 'two' });
  });

  it('keeps every other record as it was', async () => {
    const { ctx, notes } = await loaded();
    const before = notes.view();
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'one')] });
    // The op holds what the note shows already: nothing changes.
    expect(notes.view()).toBe(before);
  });
});

describe('when a change leaves the view', () => {
  it('an exact fold: at the answer', async () => {
    const { ctx, notes, answer } = await loaded();
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
    answer(0, (opId) => [updated(1, 'uno', own(opId))]);
    await tick();
    expect(ctx.changes.pending()).toEqual([]);
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'two' });
  });

  it('its events folded, the mirror holds the answer before it arrives: what comes next shows', async () => {
    const { ctx, notes, calls } = await loaded();
    const mine = ctx.changes.stage({
      label: { key: 'note.edit' },
      ops: [write(1, 'uno'), write(2, 'dos')],
    });
    // The engine publishes the change's events; its answer is still on the way.
    ctx.emitDocumentEvent(updated(1, 'uno', own(mine.opId, 0, 2)));
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'dos' });
    ctx.emitDocumentEvent(updated(2, 'dos', own(mine.opId, 1, 2)));
    // Another session changes a note the change wrote: the view shows theirs.
    ctx.emitDocumentEvent(updated(1, 'theirs', origin('remote')));
    expect(ctx.changes.pending()).toEqual([mine]);
    expect(notes.view()).toEqual({ 1: 'theirs', 2: 'dos' });

    calls[0]!.answer.resolve(resultOf(mine.opId));
    await tick();
    expect(notes.view()).toBe(notes.get());
  });

  it('a fold that reads the page again: once the read lands', async () => {
    const { ctx, notes, answer, pageLoads } = await loaded({
      pageReads: true,
      fold: (value, event) =>
        event.type === 'annotations.updated' ? reload({ pages: [page] }) : value,
    });
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
    answer(0, (opId) => [updated(1, 'uno', own(opId))]);
    await tick();
    // Answered, but the mirror doesn't hold it yet: the view keeps it.
    expect(ctx.changes.pending()).toEqual([]);
    expect(notes.get()).toEqual({ 1: 'one', 2: 'two' });
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'two' });

    pageLoads[0]!.resolve((value) => ({ ...value, 1: 'uno' }));
    await tick();
    expect(notes.get()).toEqual({ 1: 'uno', 2: 'two' });
    expect(notes.view()).toBe(notes.get());
  });

  it('a read that fails: kept until a later load lands', async () => {
    const { ctx, notes, answer, pageLoads, loads } = await loaded({
      pageReads: true,
      fold: (value, event) =>
        event.type === 'annotations.updated' ? reload({ pages: [page] }) : value,
    });
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
    answer(0, (opId) => [updated(1, 'uno', own(opId))]);
    pageLoads[0]!.reject(new Error('offline'));
    await tick();
    expect(notes.getStatus()).toBe('error');
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'two' });

    const refreshed = notes.refresh();
    loads[1]!.resolve({ 1: 'uno', 2: 'two' });
    await refreshed;
    expect(notes.view()).toBe(notes.get());
    errors.mockRestore();
  });

  it('events that arrive while a load runs: kept until that load lands', async () => {
    const { ctx, notes, answer, loads } = await loaded();
    const refreshing = notes.refresh();
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
    answer(0, (opId) => [updated(1, 'uno', own(opId))]);
    await tick();
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'two' });
    loads[1]!.resolve({ 1: 'one', 2: 'two' });
    await refreshing;
    // The queued event folded over the load, then the change left the view.
    expect(notes.get()).toEqual({ 1: 'uno', 2: 'two' });
    expect(notes.view()).toBe(notes.get());
  });

  it('a refusal: at once, with the changes that name what only it created', async () => {
    const { ctx, notes, calls } = await loaded();
    const settled = vi.fn();
    ctx.changes.onSettled(settled);
    const number = ctx.changes.takeObjectNumber()!;
    const note = ctx.changes.stage({ label: { key: 'note.create' }, ops: [create(number, 'new')] });
    const reply = ctx.changes.stage({
      label: { key: 'note.edit' },
      ops: [write(number, 'edited')],
    });
    const other = ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(2, 'dos')] });
    expect(notes.view()).toEqual({ 1: 'one', 2: 'dos', [number]: 'edited' });

    calls[0]!.answer.reject(new Error('refused'));
    await tick();
    await expect(note.result).rejects.toMatchObject({ code: 'operation-failed' });
    await expect(reply.result).rejects.toMatchObject({
      code: 'conflict',
      details: { reason: 'dependency-refused', dependsOn: note.opId },
    });
    expect(calls[1]!.abort).toHaveBeenCalled();
    expect(calls[2]!.abort).not.toHaveBeenCalled();
    expect(ctx.changes.pending()).toEqual([other]);
    expect(notes.view()).toEqual({ 1: 'one', 2: 'dos' });
    expect(settled.mock.calls.map(([event]) => event.status)).toEqual(['refused', 'refused']);
  });
});

describe('a held change', () => {
  it('shows each amendment, and is sent before the next change', async () => {
    const { ctx, notes, calls } = await loaded();
    const typing = ctx.changes.hold({ key: 'note.type' });
    typing.set([write(1, 'u')]);
    typing.set([write(1, 'uno')]);
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'two' });
    expect(calls).toHaveLength(0);

    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(2, 'dos')] });
    expect(calls.map((call) => call.change)).toEqual([
      { ops: [write(1, 'uno')] },
      { ops: [write(2, 'dos')] },
    ]);
    // Sent: amending it changes nothing any more.
    typing.set([write(1, 'late')]);
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'dos' });
  });

  it('sends the holds staged before it first, and goes away when cancelled', async () => {
    const { ctx, notes, calls } = await loaded();
    const first = ctx.changes.hold({ key: 'note.type' });
    const second = ctx.changes.hold({ key: 'note.type' });
    first.set([write(1, 'uno')]);
    second.set([write(2, 'dos')]);
    expect([first.open, second.open]).toEqual([true, true]);
    expect(first.change?.held).toBe(true);
    second.send();
    expect(calls.map((call) => call.change)).toEqual([
      { ops: [write(1, 'uno')] },
      { ops: [write(2, 'dos')] },
    ]);
    // Sent, by its own send or another's: what comes next is a new change.
    expect([first.open, second.open]).toEqual([false, false]);
    expect(calls.map((call) => call.opId)).toEqual([first.change?.opId, second.change?.opId]);

    const third = ctx.changes.hold({ key: 'note.type' });
    third.set([write(1, 'tres')]);
    third.cancel();
    expect(third.open).toBe(false);
    third.set([write(1, 'cuatro')]);
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'dos' });
    expect(calls).toHaveLength(2);
  });

  it('is sent before a download', async () => {
    const { ctx, calls, answer } = await loaded();
    const typing = ctx.changes.hold({ key: 'note.type' });
    typing.set([write(1, 'uno')]);
    const settling = ctx.settle();
    expect(calls).toHaveLength(1);
    answer(0);
    await settling;
  });

  it('carries its merge key, and is sent on request, as an undo sends it first', async () => {
    const { ctx, calls } = await loaded();
    const typing = ctx.changes.hold({ key: 'note.type' }, { merge: 'note:1' });
    typing.set([write(1, 'uno')]);
    expect(ctx.changes.pending().map((change) => change.merge)).toEqual(['note:1']);
    ctx.changes.sendHolds();
    expect(calls.map((call) => call.change)).toEqual([{ ops: [write(1, 'uno')] }]);
    expect(typing.open).toBe(false);
    const other = ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(2, 'dos')] });
    expect(other.merge).toBeNull();
  });
});

describe('a group', () => {
  it('makes everything staged inside it one change, its undo last part first', async () => {
    const { ctx, notes, calls } = await loaded();
    const value = ctx.changes.group({ key: 'notes.edit', count: 2 }, () => {
      ctx.changes.stage({
        label: { key: 'note.edit' },
        ops: [write(1, 'uno')],
        undo: [write(1, 'one')],
      });
      // A nested group joins the outer one.
      ctx.changes.group({ key: 'inner' }, () =>
        ctx.changes.stage({
          label: { key: 'note.edit' },
          ops: [write(2, 'dos')],
          undo: [write(2, 'two')],
        }),
      );
      return 'done';
    });
    expect(value).toBe('done');
    expect(calls.map((call) => call.change)).toEqual([{ ops: [write(1, 'uno'), write(2, 'dos')] }]);
    const [change] = ctx.changes.pending();
    expect(change!.label).toEqual({ key: 'notes.edit', count: 2 });
    expect(change!.undo).toEqual([write(2, 'two'), write(1, 'one')]);
    expect(notes.view()).toEqual({ 1: 'uno', 2: 'dos' });
  });

  it('sends nothing when its run throws, and refuses a hold', async () => {
    const { ctx, notes, calls } = await loaded();
    expect(() =>
      ctx.changes.group({ key: 'notes.edit' }, () => {
        ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
        throw new Error('the action failed');
      }),
    ).toThrow('the action failed');
    expect(calls).toHaveLength(0);
    expect(notes.view()).toEqual({ 1: 'one', 2: 'two' });
    expect(() => ctx.changes.group({ key: 'g' }, () => ctx.changes.hold({ key: 'h' }))).toThrow(
      /inside a group/,
    );
  });
});

describe('one store update per change', () => {
  it("a change's events land at once, whoever made them", async () => {
    const { ctx, notes } = await loaded();
    const updates: unknown[] = [];
    ctx.subscribe(() => updates.push(notes.get()));
    const tx = (index: number) => origin('remote', { id: 'their-change', index, count: 2 });
    ctx.emitDocumentEvent(updated(1, 'eins', tx(0)));
    ctx.emitDocumentEvent(updated(2, 'zwei', tx(1)));
    expect(updates).toEqual([{ 1: 'eins', 2: 'zwei' }]);

    // Events of no change, or a change of one event, each notify.
    ctx.emitDocumentEvent(updated(1, 'one', origin('remote')));
    expect(updates).toHaveLength(2);
  });
});

describe('page mirrors', () => {
  it("show a loaded page's pending changes, and nothing for a page that isn't loaded", async () => {
    const ctx = createTestContext({
      doc: {
        apply: () => Object.assign(new Promise(() => {}), { abort: () => {} }),
      } as never,
    });
    const links: PageMirror<Notes> = ctx.pageMirror<Notes>({
      name: 'links',
      load: async () => ({ 1: 'one' }),
      affected: () => null,
      predict: (value, op, at: PageRef) =>
        at.objectNumber === 1 ? predictNotes(value, op) : value,
    });
    ctx.connect({ api: {} });
    await links.ensureLoaded(page);
    ctx.changes.stage({ label: { key: 'note.edit' }, ops: [write(1, 'uno')] });
    expect(links.view(page)).toEqual({ 1: 'uno' });
    expect(links.get(page)).toEqual({ 1: 'one' });
    expect(links.view(toPageRef(2))).toBeUndefined();
  });
});
