import type { DocumentEvent } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import {
  EngineError,
  EngineErrorCode,
  toPageRef,
  type AnnotationRef,
  type Change,
  type ChangeOp,
  type ChangeResult,
} from '@embedpdf/engine-core/runtime';
import { describe, expect, it } from 'vitest';

import {
  HISTORY_DEFAULTS,
  type HistoryCapability,
  type HistorySettings,
  type HistoryUndoFailedEvent,
  type HistoryUndoneEvent,
} from '../src/contract';
import { createHistoryController } from '../src/controller';
import { emptyHistory, type History } from '../src/model';

/**
 * The history on the kernel's real change queue, over an engine whose
 * answers each test gives by hand: what is recorded, what an undo and a redo
 * stage, and what every kind of answer does to the history.
 */

const PAGE = toPageRef(1);
const ref = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber,
});
const move = (objectNumber: number, x: number): ChangeOp => ({
  type: 'annotations.update',
  ref: ref(objectNumber),
  patch: { subtype: 'square', box: { x, y: 0, width: 10, height: 10 } },
});
const label = (key: string) => ({ key });

interface Sent {
  readonly change: Change;
  readonly opId: string;
  answer(result?: Partial<ChangeResult>): void;
  refuse(error: unknown): void;
}

function setup(config: Partial<HistorySettings> = {}) {
  const sent: Sent[] = [];
  const ctx = createTestContext<History, HistorySettings>({
    id: 'history',
    state: emptyHistory(),
    settings: { defaults: HISTORY_DEFAULTS, registered: config },
    doc: {
      apply: ((change: Change, options: { opId: string }) =>
        new Promise<ChangeResult>((resolve, reject) => {
          sent.push({
            change,
            opId: options.opId,
            answer: (result = {}) =>
              resolve({
                items: [],
                ...result,
                meta: {
                  affectedPages: [],
                  cacheDelta: null,
                  opId: options.opId,
                  undoable: true,
                  ...result.meta,
                },
              }),
            refuse: reject,
          });
        })) as never,
    },
  });
  const history: HistoryCapability = ctx.connect(createHistoryController(ctx));
  const undone: HistoryUndoneEvent[] = [];
  const failed: HistoryUndoFailedEvent[] = [];
  history.onUndone((event) => undone.push(event));
  history.onUndoFailed((event) => failed.push(event));
  /** Stage one action, as a plugin does. */
  const act = (key: string, objectNumber = 10, x = 1) =>
    ctx.changes.stage({
      label: label(key),
      ops: [move(objectNumber, x)],
      undo: [move(objectNumber, 0)],
    });
  /** Let every answer given so far land. */
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  return { ctx, history, sent, undone, failed, act, settle };
}

const unavailableError = () =>
  new EngineError(EngineErrorCode.UndoUnavailable, 'can not be undone', {
    details: { reason: 'final-change' },
  });

describe('recording', () => {
  it('records every change this session stages, as it is staged', () => {
    const { history, act } = setup();
    expect(history.canUndo()).toBe(false);
    act('annotation.move');
    act('annotation.update');
    // Before any answer: Ctrl+Z right after an action undoes that action.
    expect(history.canUndo()).toBe(true);
    expect(history.getUndoLabel()).toEqual(label('annotation.update'));
    expect(history.canRedo()).toBe(false);
  });

  it('leaves out changes that are not steps, and undos', () => {
    const { ctx, history } = setup();
    ctx.changes.stage({ label: label('form.calculate'), ops: [move(10, 1)], history: false });
    expect(history.canUndo()).toBe(false);
    ctx.changes.stage({ label: label('history.undo'), undoOf: 'elsewhere', shows: [] });
    expect(history.canUndo()).toBe(false);
  });

  it('forgets what could be redone once a new change is staged', () => {
    const { history, act } = setup();
    act('a');
    history.undo();
    expect(history.canRedo()).toBe(true);
    act('b');
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoLabel()).toEqual(label('b'));
  });

  it('keeps the newest `limit` steps', () => {
    const { history, act } = setup({ limit: 2 });
    act('a');
    act('b');
    act('c');
    history.undo();
    history.undo();
    expect(history.canUndo()).toBe(false);
    expect(history.getRedoLabel()).toEqual(label('b'));
  });
});

describe('undo and redo', () => {
  it('stage the undo of the change, then the undo of the undo, each showing its prediction', () => {
    const { ctx, history, sent, act } = setup();
    const forward = act('annotation.move', 10, 5);
    history.undo();
    expect(sent.map((one) => one.change)).toEqual([
      { ops: [move(10, 5)] },
      { undoOf: forward.opId },
    ]);
    // The undo shows what the change said undoing it looks like.
    const undo = ctx.changes.pending().at(-1)!;
    expect(undo.undoOf).toBe(forward.opId);
    expect(undo.shows).toEqual([move(10, 0)]);
    expect(history.canUndo()).toBe(false);
    expect(history.getRedoLabel()).toEqual(label('annotation.move'));

    history.redo();
    const redo = ctx.changes.pending().at(-1)!;
    expect(redo.undoOf).toBe(undo.opId);
    expect(redo.shows).toEqual([move(10, 5)]);
    expect(history.getUndoLabel()).toEqual(label('annotation.move'));
    // The next undo undoes the redo.
    history.undo();
    expect(ctx.changes.pending().at(-1)!.undoOf).toBe(redo.opId);
  });

  it('do nothing when there is nothing to step over', () => {
    const { history, sent } = setup();
    history.undo();
    history.redo();
    expect(sent).toEqual([]);
  });

  it('report the answer once, with how many parts were left alone', async () => {
    const { history, sent, undone, failed, act, settle } = setup();
    act('annotation.move');
    history.undo();
    sent[0]!.answer();
    sent[1]!.answer({
      items: [
        { type: 'skipped', op: 'annotations.update', meta: {} as never },
        { type: 'annotations.update', skipped: ['color'] } as never,
        { type: 'annotations.update' } as never,
      ],
    });
    await settle();
    expect(undone).toEqual([{ label: label('annotation.move'), redo: false, skipped: 2 }]);
    expect(failed).toEqual([]);
  });

  it('send what is still being typed first, and undo it', () => {
    const { ctx, history, sent } = setup();
    const typing = ctx.changes.hold(label('annotation.text'), { merge: 'text:10' });
    typing.set([move(10, 3)]);
    // Not sent, not recorded yet, but there is something to undo.
    expect(sent).toEqual([]);
    expect(history.canUndo()).toBe(true);
    expect(history.getUndoLabel()).toEqual(label('annotation.text'));
    history.undo();
    expect(sent.map((one) => one.change)).toEqual([
      { ops: [move(10, 3)] },
      { undoOf: typing.change!.opId },
    ]);
    expect(history.canRedo()).toBe(true);
  });
});

describe('typing merges', () => {
  it('makes the pauses of one typing session one step, undone newest first and redone oldest first', () => {
    const { ctx, history, sent } = setup();
    const pauses = [1, 2, 3].map((x) => {
      const hold = ctx.changes.hold(label('annotation.text'), { merge: 'text:10' });
      hold.set([move(10, x)], [move(10, x - 1)]);
      return hold.send()!;
    });
    history.undo();
    expect(sent.slice(3).map((one) => one.change)).toEqual(
      [...pauses].reverse().map((pause) => ({ undoOf: pause.opId })),
    );
    expect(history.canUndo()).toBe(false);
    const undos = sent.slice(3).map((one) => one.opId);
    history.redo();
    expect(sent.slice(6).map((one) => one.change)).toEqual(
      [...undos].reverse().map((opId) => ({ undoOf: opId })),
    );
  });

  it('starts a new step after another change, an undo, or another key', () => {
    const { ctx, history, act } = setup();
    const type = (key: string, x: number) => {
      const hold = ctx.changes.hold(label('annotation.text'), { merge: key });
      hold.set([move(10, x)]);
      hold.send();
    };
    type('text:10', 1);
    act('annotation.move');
    type('text:10', 2);
    type('text:11', 3);
    let steps = 0;
    while (history.canUndo()) {
      history.undo();
      steps += 1;
    }
    expect(steps).toBe(4);
  });
});

describe('answers', () => {
  it('a refused change leaves the history, and its undo already on the way says nothing', async () => {
    const { history, sent, failed, undone, act, settle } = setup();
    act('a');
    act('b');
    history.undo();
    sent[1]!.refuse(new EngineError(EngineErrorCode.ChangeConflict, 'no'));
    sent[2]!.refuse(new EngineError(EngineErrorCode.NotFound, 'no such change'));
    await settle();
    expect(history.canRedo()).toBe(false);
    expect(history.getUndoLabel()).toEqual(label('a'));
    expect(failed).toEqual([]);
    expect(undone).toEqual([]);
  });

  it('a change that did nothing leaves the history', async () => {
    const { history, sent, act, settle } = setup();
    act('a');
    act('b');
    sent[1]!.answer({ meta: { undoable: false } as never });
    await settle();
    expect(history.getUndoLabel()).toEqual(label('a'));
  });

  it('a refused undo puts the step back, to be tried again', async () => {
    const { history, sent, failed, act, settle } = setup();
    const forward = act('a');
    history.undo();
    expect(history.canUndo()).toBe(false);
    const refusal = new EngineError(EngineErrorCode.Forbidden, 'no rights');
    sent[1]!.refuse(refusal);
    await settle();
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(false);
    expect(failed).toMatchObject([{ label: label('a'), redo: false, reason: 'refused' }]);
    // Trying again undoes the change itself, not the refused undo.
    history.undo();
    expect(sent[2]!.change).toEqual({ undoOf: forward.opId });
  });

  it('a refused undo comes back in its place under what was done since', async () => {
    const { history, sent, act, settle } = setup();
    act('a');
    act('b');
    history.undo();
    act('c');
    sent[2]!.refuse(new EngineError(EngineErrorCode.Forbidden, 'no rights'));
    await settle();
    expect(history.getUndoLabel()).toEqual(label('c'));
    history.undo();
    expect(history.getUndoLabel()).toEqual(label('b'));
  });

  it('a redo staged behind a refused undo changes nothing more', async () => {
    const { history, sent, failed, act, settle } = setup();
    const forward = act('a');
    history.undo();
    history.redo();
    sent[1]!.refuse(new EngineError(EngineErrorCode.Forbidden, 'no rights'));
    sent[2]!.refuse(new EngineError(EngineErrorCode.NotFound, 'no such change'));
    await settle();
    expect(failed).toHaveLength(1);
    expect(history.canRedo()).toBe(false);
    history.undo();
    expect(sent[3]!.change).toEqual({ undoOf: forward.opId });
  });

  it('a step that can no longer be undone goes, with everything before it', async () => {
    const { history, sent, failed, act, settle } = setup();
    act('a');
    act('b');
    act('c');
    history.undo();
    history.undo();
    act('d');
    sent[4]!.refuse(unavailableError());
    await settle();
    expect(failed).toMatchObject([{ label: label('b'), redo: false, reason: 'unavailable' }]);
    // `a` was before `b`: gone. `c`'s undo applied, `d` came after.
    history.undo();
    expect(history.canUndo()).toBe(false);
  });

  it('a merged step whose undo is refused in part keeps the part that did not move', async () => {
    const { ctx, history, sent, settle } = setup();
    for (const x of [1, 2]) {
      const hold = ctx.changes.hold(label('annotation.text'), { merge: 'text:10' });
      hold.set([move(10, x)]);
      hold.send();
    }
    history.undo();
    sent[2]!.answer();
    sent[3]!.refuse(new EngineError(EngineErrorCode.Forbidden, 'no rights'));
    await settle();
    expect(history.canUndo()).toBe(true);
    expect(history.canRedo()).toBe(true);
    history.undo();
    expect(sent[4]!.change).toEqual({ undoOf: sent[0]!.opId });
  });
});

describe('what ends undo', () => {
  const origin = { kind: 'remote', sessionId: 'other', sub: null, ts: 0, serverId: 1 } as const;

  it.each([
    'redaction.applied',
    'pages.flattened',
    'signatures.completed',
    'forms.repaired',
    'document.versioned',
  ])('%s clears both stacks', (type) => {
    const { ctx, history, act } = setup();
    act('a');
    act('b');
    history.undo();
    ctx.emitDocumentEvent({ type, origin } as unknown as DocumentEvent);
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('a step on its way when the history cleared puts nothing back', async () => {
    const { ctx, history, sent, act, settle } = setup();
    act('a');
    history.undo();
    ctx.emitDocumentEvent({ type: 'redaction.applied', origin } as unknown as DocumentEvent);
    sent[1]!.refuse(unavailableError());
    await settle();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });

  it('clear() forgets every step', () => {
    const { history, act } = setup();
    act('a');
    history.undo();
    act('b');
    history.clear();
    expect(history.canUndo()).toBe(false);
    expect(history.canRedo()).toBe(false);
  });
});
