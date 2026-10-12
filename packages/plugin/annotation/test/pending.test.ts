/**
 * What the user sees while, and after, a change is on its way. A change
 * shows at once; once the engine answered, the view shows the engine's
 * truth: the confirmed record, including anything another session changed
 * meanwhile. Nothing is restored from a copy taken before the change. The
 * engine answers changes in the order they were staged.
 */
import type { DocumentEvent } from '@embedpdf/core';
import { type Message, styleOf } from '@embedpdf/core-annotation';
import type { AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  annotationHarness,
  dataOf,
  PAGE2,
  snapshotOf,
  type AnnotationHarness,
  type FileAnnotation,
} from './harness';
import { createdRefOf } from '../src/write/outcomes';

const PAGE = toPageRef(1);

/** A square drawn through the gesture door, as a tool makes it; resolves with its confirmed ref. */
const drawSquare = (harness: AnnotationHarness) => {
  const draw = (phase: 'down' | 'move' | 'up', x: number, y: number): Message => ({
    type: 'createPointer',
    phase,
    subtype: 'square',
    in: { page: PAGE, point: { x, y }, shift: false },
  });
  harness.commit(draw('down', 10, 10));
  harness.commit(draw('move', 60, 50));
  return createdRefOf(harness.commit(draw('up', 60, 50)));
};
const NO_FLAGS: AnnotationFlags = {
  invisible: false,
  hidden: false,
  print: true,
  noZoom: false,
  noRotate: false,
  noView: false,
  readOnly: false,
  locked: false,
  toggleNoView: false,
  lockedContents: false,
};
const BLACK = '#000000';

const ref = (annotObjectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber: annotObjectNumber,
});

const square = (objectNumber: number, extra: Record<string, unknown> = {}): FileAnnotation =>
  ({
    ref: ref(objectNumber),
    page: PAGE,
    hasAppearance: true,
    appearanceState: null,
    nm: null,
    ...NO_FLAGS,
    contents: null,
    subject: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'square',
    rect: { left: 100, bottom: 700, right: 180, top: 760 },
    box: { left: 100, bottom: 700, right: 180, top: 760 },
    color: BLACK,
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    modifiedBy: null,
    importedBy: null,
    actions: null,
    ...extra,
  }) as unknown as FileAnnotation;

const freeText = (contents: string, extra: Record<string, unknown> = {}): FileAnnotation =>
  square(30, {
    subtype: 'free-text',
    intent: 'free-text',
    contents,
    fontFamily: 'helvetica',
    fontSize: 12,
    textAlign: 'left',
    richText: {
      body: {
        family: 'Helvetica',
        weight: 400,
        italic: false,
        size: 12,
        color: '#000000',
        decoration: [],
        script: 'normal',
        letterSpacing: 0,
        horizontalScale: 1,
        align: 'left',
        dir: 'ltr',
      },
      paragraphs: [{ runs: [{ text: contents }] }],
    },
    borderStyle: 'solid',
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    box: { left: 100, bottom: 700, right: 300, top: 740 },
    ...extra,
  });

const remoteUpdate = (dto: FileAnnotation): DocumentEvent =>
  ({
    type: 'annotations.updated',
    page: PAGE,
    origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: 50 },
    annotation: dto,
    appearance: { changed: false },
    meta: { affectedPages: [], cacheDelta: null, changed: [] },
  }) as unknown as DocumentEvent;

/** A promise the test settles by hand, for a write that stays in flight. */
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('a refused change shows the truth', () => {
  it('a refused delete brings the annotation back', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.remove.mockRejectedValueOnce(new Error('revoked'));
    harness.capability.selection.set([ref(20)]);

    const result = await harness.capability.selection.delete();

    expect(result.failed.map((failure) => failure.ref)).toEqual([ref(20)]);
    expect(harness.capability.get(ref(20))).not.toBeNull();
  });

  it('a refused flags change reverts the flags', async () => {
    const harness = annotationHarness();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await harness.load([square(20)]);
    harness.update.mockRejectedValueOnce(new Error('Forbidden'));
    harness.capability.selection.set([ref(20)]);

    const result = await harness.capability.selection.update({ locked: true });

    expect(result.failed).toHaveLength(1);
    expect(harness.capability.get(ref(20))!.locked).toBe(false);
  });

  it("a refused restyle shows the collaborator's change that landed meanwhile", async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = deferred<unknown>();
    harness.update.mockReturnValueOnce(write.promise);
    harness.capability.selection.set([ref(20)]);

    const restyle = harness.capability.selection.update({ color: '#00ff00' });
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#00ff00');
    harness.emit(remoteUpdate(square(20, { contents: 'from Bob' })));
    write.reject(new Error('Forbidden'));
    await restyle;

    const annotation = harness.capability.get(ref(20))!;
    expect(dataOf(annotation).color).toBe('#000000');
    expect(annotation.contents).toBe('from Bob');
  });

  it('a restyle of several annotations is one change: refused, every one shows the truth', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21)]);
    harness.update.mockImplementation(async (target: AnnotationRef) => {
      if (target.kind === 'objectNumber' && target.objectNumber === 21) {
        throw new Error('Forbidden');
      }
      return { annotation: square(20, { color: '#00ff00' }) };
    });
    harness.capability.selection.set([ref(20), ref(21)]);

    const result = await harness.capability.selection.update({ color: '#00ff00' });

    expect(harness.applied).toHaveLength(1);
    expect(result.failed.map((failure) => failure.ref)).toEqual([ref(20), ref(21)]);
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#000000');
    expect(dataOf(harness.capability.get(ref(21))).color).toBe('#000000');
  });
});

describe('what the capability says about a change', () => {
  it('a refused change fires onWriteFailed with the annotations it carried', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);
    harness.update.mockRejectedValueOnce(new Error('Forbidden'));
    harness.capability.selection.set([ref(20)]);

    await harness.capability.selection.update({ color: '#00ff00' });

    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0]![0].refs).toEqual([ref(20)]);
  });

  it('an annotation is pending while its change is on its way, and raw stays the confirmed record', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = deferred<unknown>();
    harness.update.mockReturnValueOnce(write.promise);
    harness.capability.selection.set([ref(20)]);

    const restyle = harness.capability.selection.update({ color: '#00ff00' });
    expect(harness.capability.isPending(ref(20))).toBe(true);
    write.resolve({ annotation: square(20, { color: '#00ff00' }) });
    await restyle;

    expect(harness.capability.isPending(ref(20))).toBe(false);
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#00ff00');
  });

  it('a refused create removes the new annotation, rejects, and names it', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    harness.create.mockRejectedValueOnce(new Error('Forbidden'));
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);

    const created = drawSquare(harness);
    const [id] = harness.model().order;
    const newRef = harness.model().byId[id!]!.annotation.ref;
    expect(harness.model().selected).toEqual([id]);

    await expect(created).rejects.toMatchObject({ code: 'operation-failed' });
    expect(harness.model().order).toEqual([]);
    expect(harness.model().selected).toEqual([]);
    expect(failures.mock.calls[0]![0].refs).toEqual([newRef]);
  });
});

describe('typing', () => {
  it('an older echo never replaces newer typing, which stays pending', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    const firstWrite = deferred<unknown>();
    harness.update.mockReturnValueOnce(firstWrite.promise);

    harness.capability.draftContents(ref(30), 'Hello w');
    await vi.advanceTimersByTimeAsync(300); // typing paused: 'Hello w' is sent
    expect(harness.update).toHaveBeenCalledTimes(1);
    harness.capability.draftContents(ref(30), 'Hello world');
    firstWrite.resolve({ annotation: freeText('Hello w') });
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.capability.get(ref(30))!.contents).toBe('Hello world');
    expect(harness.capability.isPending(ref(30))).toBe(true);
  });

  it('every keystroke before a pause is one change, sent once', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    harness.update.mockResolvedValueOnce({ annotation: freeText('Hello abc') });

    for (const text of ['Hello a', 'Hello ab', 'Hello abc']) {
      harness.capability.draftContents(ref(30), text);
      await vi.advanceTimersByTimeAsync(100);
      expect(harness.capability.get(ref(30))!.contents).toBe(text);
    }
    expect(harness.applied).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.applied).toHaveLength(1);
    expect(harness.update.mock.calls[0]![1]).toMatchObject({
      richText: { paragraphs: [{ runs: [{ text: 'Hello abc' }] }] },
    });
  });
});

describe('settle before a download', () => {
  it('sends the text typed a moment ago without waiting for the pause', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    harness.update.mockResolvedValueOnce({ annotation: freeText('Hello world') });

    harness.capability.draftContents(ref(30), 'Hello world'); // held back until typing pauses
    expect(harness.update).not.toHaveBeenCalled();
    const settled = harness.ctx.settle();
    await vi.advanceTimersByTimeAsync(0); // no time passes: the pause never ends
    await settled;

    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update.mock.calls[0]![1]).toMatchObject({
      richText: { paragraphs: [{ runs: [{ text: 'Hello world' }] }] },
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.update).toHaveBeenCalledTimes(1); // the pause sends nothing more
  });

  it('waits for a change already on its way', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    const write = deferred<unknown>();
    harness.update.mockReturnValueOnce(write.promise);
    harness.capability.draftContents(ref(30), 'Hello w');
    await vi.advanceTimersByTimeAsync(300); // the pause ended: the change is sent

    let settled = false;
    void harness.ctx.settle().then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    write.resolve({ annotation: freeText('Hello w') });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(true);
  });
});

describe('several changes to one record', () => {
  it('a flags change while typing sends the typing first, then itself; both show throughout', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    harness.capability.selection.set([ref(30)]);
    const locked = { ...NO_FLAGS, locked: true };

    harness.capability.draftContents(ref(30), 'Hello world');
    harness.update
      .mockResolvedValueOnce({ annotation: freeText('Hello world') })
      .mockResolvedValueOnce({ annotation: freeText('Hello world', locked) });
    const locking = harness.capability.selection.update({ locked: true });
    expect(harness.capability.get(ref(30))!.contents).toBe('Hello world');
    expect(harness.capability.get(ref(30))!.locked).toBe(true);
    await locking;

    expect(harness.applied).toHaveLength(2);
    expect(harness.update.mock.calls[0]![1]).toMatchObject({
      subtype: 'free-text',
      richText: { paragraphs: [{ runs: [{ text: 'Hello world' }] }] },
    });
    expect(harness.update.mock.calls[1]![1]).toEqual({ subtype: 'free-text', locked: true });
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.applied).toHaveLength(2);
    expect(harness.capability.get(ref(30))).toMatchObject({
      contents: 'Hello world',
      locked: true,
    });
  });

  it("an update of another field while typing shows both: the typing and the update's result", async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    // The box the engine keeps in the file, and the same box on the 800-high page.
    const inFile = { left: 200, bottom: 600, right: 400, top: 640 };
    const moved = { x: 200, y: 160, width: 200, height: 40 };

    harness.capability.draftContents(ref(30), 'Hello world');
    harness.update
      .mockResolvedValueOnce({ annotation: freeText('Hello world') })
      .mockResolvedValueOnce({
        annotation: freeText('Hello world', { rect: inFile, box: inFile }),
      });
    await harness.capability.update(ref(30), { subtype: 'free-text', box: moved } as never);

    const annotation = harness.capability.get(ref(30))!;
    expect(annotation.contents).toBe('Hello world');
    expect(dataOf(annotation).box).toEqual(moved); // the moved box, not the one typing started in
  });

  it('a newer restyle answered after an older one shows the newer value throughout', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    const older = deferred<unknown>();
    harness.update
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ annotation: square(20, { color: '#0000ff' }) });

    const red = harness.capability.selection.update({ color: '#ff0000' });
    const blue = harness.capability.selection.update({ color: '#0000ff' });
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#0000ff');

    // The older answer lands first: the newer change still shows over it.
    older.resolve({ annotation: square(20, { color: '#ff0000' }) });
    await red;
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#0000ff');
    await blue;
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#0000ff');
  });

  it('an older change refused leaves the newer one standing', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    const older = deferred<unknown>();
    harness.update
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ annotation: square(20, { color: '#0000ff' }) });

    const red = harness.capability.selection.update({ color: '#ff0000' });
    const blue = harness.capability.selection.update({ color: '#0000ff' });
    older.reject(new Error('Forbidden'));
    expect((await red).failed).toHaveLength(1);
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#0000ff');
    expect((await blue).failed).toEqual([]);
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#0000ff');
  });
});

describe('a new record before the engine answered its create', () => {
  const createHeld = async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const create = deferred<unknown>();
    harness.create.mockReturnValueOnce(create.promise);
    const created = drawSquare(harness);
    const [id] = harness.model().order;
    const newRef = harness.model().byId[id!]!.annotation.ref;
    const confirm = () => create.resolve({ annotation: square(60) });
    return { harness, create, created, confirm, id: id!, newRef };
  };

  it('an edit shows at once, is sent behind the create, and the selection stays', async () => {
    const { harness, created, confirm, id, newRef } = await createHeld();
    harness.update.mockResolvedValueOnce({ annotation: square(60, { color: '#00ff00' }) });

    const restyle = harness.capability.selection.update({ color: '#00ff00' });
    expect(harness.model().order).toEqual([id]);
    expect(styleOf(harness.model().byId[id]!.annotation).color).toBe('#00ff00');
    // Staged and sent, naming the new record by its number: the engine runs it after the create.
    expect(harness.applied).toHaveLength(2);
    expect(harness.update).not.toHaveBeenCalled();

    confirm();
    await created;
    await restyle;
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update.mock.calls[0]![0]).toEqual(newRef);
    expect(harness.model().selected).toEqual([id]);
    expect(dataOf(harness.capability.get(newRef)).color).toBe('#00ff00');
  });

  it('a delete hides it for good: the engine deletes it after the create', async () => {
    const { harness, created, confirm, newRef } = await createHeld();

    const deleted = harness.capability.selection.delete();
    expect(harness.model().order).toEqual([]);

    confirm();
    await created;
    await deleted;
    expect(harness.remove).toHaveBeenCalledWith(newRef);
    expect(harness.model().order).toEqual([]);
  });

  it('a refused create refuses the edit staged behind it, which never runs, and reports both', async () => {
    const { harness, create, created } = await createHeld();
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);

    const restyle = harness.capability.selection.update({ color: '#00ff00' });
    create.reject(new Error('Forbidden'));
    await expect(created).rejects.toBeDefined();
    const outcome = await restyle;

    expect(outcome.failed[0]!.error).toMatchObject({
      code: 'conflict',
      message: expect.stringContaining('depends on'),
    });
    expect(harness.model().order).toEqual([]);
    expect(harness.update).not.toHaveBeenCalled();
    expect(failures).toHaveBeenCalledTimes(2);
  });

  it('a link set on it joins the queue behind its create, naming it by its number', async () => {
    const { harness, created, confirm, newRef } = await createHeld();
    const TARGET = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
    harness.create.mockResolvedValueOnce({
      annotation: square(61, {
        subtype: 'link',
        target: TARGET,
        reply: { to: newRef, type: 'group' },
      }),
    });
    const linked = harness.capability.selection.updateLink(TARGET);
    expect(harness.capability.links.get(newRef)).toEqual(TARGET);

    confirm();
    await created;
    await linked;
    expect(harness.create).toHaveBeenCalledTimes(2);
    expect(harness.create.mock.calls[1]![0]).toMatchObject({
      subtype: 'link',
      target: TARGET,
      reply: { to: newRef, type: 'group' },
    });
    expect(harness.capability.links.get(newRef)).toEqual(TARGET);
  });

  it('deleted elsewhere after its events arrived, it stays deleted though the answer comes later', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    // The engine publishes the create (a cloud engine's events can arrive
    // well before its answer); then another session deletes it.
    let publish!: () => void;
    let answer!: () => void;
    harness.create.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          answer = () => resolve({ annotation: square(60) });
          publish = () => undefined;
        }),
    );
    const created = drawSquare(harness);
    const [id] = harness.model().order;
    const newRef = harness.model().byId[id!]!.annotation.ref;
    const opId = harness.pending()[0]!.opId;
    const meta = { affectedPages: [], cacheDelta: null, changed: [] };
    publish();
    harness.emit({
      type: 'annotations.created',
      page: PAGE,
      origin: {
        kind: 'local',
        sessionId: 'me',
        sub: null,
        ts: 0,
        serverId: null,
        tx: { id: opId, index: 0, count: 1 },
      },
      annotation: { ...square(60), ref: newRef },
      meta,
    } as unknown as DocumentEvent);
    expect(harness.capability.get(newRef)).not.toBeNull();
    harness.emit({
      type: 'annotations.deleted',
      page: PAGE,
      deleted: [newRef],
      origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: 50 },
      meta,
    } as unknown as DocumentEvent);

    expect(harness.capability.get(newRef)).toBeNull();
    expect(harness.model().order).toEqual([]);
    // The fake engine publishes its create again when it answers; stop looking here.
    answer();
    await created.catch(() => {});
  });
});

describe('the selection follows undo and redo', () => {
  it('an undo selects what was selected before the change, a redo what was after it', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21)]);
    harness.capability.selection.set([ref(20)]);

    await harness.capability.selection.delete();
    expect(harness.model().selected).toEqual([]);
    const deleted = harness.applied.at(-1)!;
    const undo = harness.ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: deleted.opId,
      shows: [{ type: 'annotations.restore', annotation: harness.read(square(20)), index: 0 }],
    });
    // The square is back in the view, selected as it was before the delete.
    expect(harness.model().order).toEqual(['obj:20', 'obj:21']);
    expect(harness.model().selected).toEqual(['obj:20']);

    harness.ctx.changes.stage({
      label: { key: 'history.redo' },
      undoOf: undo.opId,
      shows: [{ type: 'annotations.delete', ref: ref(20) }],
    });
    expect(harness.model().order).toEqual(['obj:21']);
    expect(harness.model().selected).toEqual([]);
  });

  it('a record that no longer shows is left out; nothing left clears the selection', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.create.mockReturnValue(new Promise(() => {}));
    void drawSquare(harness);
    const [, id] = harness.model().order;
    harness.capability.selection.set([ref(20)]);
    const remove = harness.capability.delete(ref(20));
    void remove.catch(() => {});
    const deleted = harness.pending().at(-1)!;
    // Undoing the create (staged before the delete) takes the new square away; what was
    // selected before the create was nothing.
    harness.ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: harness.pending()[0]!.opId,
      shows: harness.pending()[0]!.undo,
    });
    expect(harness.model().byId[id!]).toBeUndefined();
    expect(harness.model().selected).toEqual([]);
    expect(deleted.undoOf).toBeNull();
  });
});

describe('a full load while changes are on their way', () => {
  it('a create the engine answers while a full load runs stays on screen and selected', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const load = deferred<unknown>();
    harness.listAll.mockReturnValueOnce(load.promise);
    const refreshed = harness.capability.refresh();
    harness.create.mockResolvedValueOnce({ annotation: square(60) });

    const created = drawSquare(harness);
    const [id] = harness.model().order;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.model().order).toEqual([id]);
    expect(harness.model().selected).toEqual([id]);

    // The load read the page before the create: the create's event, queued
    // behind it, brings the record in.
    load.resolve(snapshotOf([]));
    await refreshed;
    await created;
    expect(harness.model().order).toEqual([id]);
    expect(harness.model().selected).toEqual([id]);
    expect(harness.pending()).toEqual([]);
  });

  it('a new record answered while a full load runs can be edited at once', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const load = deferred<unknown>();
    harness.listAll.mockReturnValueOnce(load.promise);
    const refreshed = harness.capability.refresh();
    harness.create.mockResolvedValueOnce({ annotation: square(60) });
    const created = drawSquare(harness);
    const [id] = harness.model().order;
    const newRef = harness.model().byId[id!]!.annotation.ref;
    await new Promise((resolve) => setTimeout(resolve, 0));

    harness.update.mockResolvedValueOnce({ annotation: square(60, { color: '#00ff00' }) });
    const restyled = harness.capability.selection.update({ color: '#00ff00' });
    expect(harness.update).toHaveBeenCalledWith(newRef, expect.anything());

    load.resolve(snapshotOf([]));
    await refreshed;
    await created;
    expect(await restyled).toMatchObject({ applied: [newRef], failed: [] });
    expect(dataOf(harness.capability.get(newRef)).color).toBe('#00ff00');
  });
});

describe('links', () => {
  it('two link sets in a row: the second retargets the child the first creates', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const FIRST = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
    const SECOND = { kind: 'uri', uri: 'https://www.cloudpdf.com/' } as const;
    const child = deferred<unknown>();
    harness.create.mockReturnValueOnce(child.promise);
    const linkOf = (target: unknown) =>
      square(61, { subtype: 'link', target, reply: { to: ref(20), type: 'group' } });

    const first = harness.capability.links.set(ref(20), FIRST);
    const second = harness.capability.links.set(ref(20), SECOND);
    expect(harness.capability.links.get(ref(20))).toEqual(SECOND);

    harness.update.mockResolvedValueOnce({ annotation: linkOf(SECOND) });
    child.resolve({ annotation: linkOf(FIRST) });
    await first;
    await second;

    expect(harness.create).toHaveBeenCalledTimes(1);
    const childRef = harness.capability.list().find((annotation) => annotation.subtype === 'link')!;
    expect(harness.update).toHaveBeenCalledWith(
      childRef.ref,
      expect.objectContaining({ target: SECOND }),
    );
    expect(harness.capability.links.get(ref(20))).toEqual(SECOND);
  });
});

describe('what stays as it is', () => {
  it('a pending edit never brings back a record deleted elsewhere', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    harness.update.mockReturnValueOnce(deferred<unknown>().promise);

    void harness.capability.selection.update({ color: '#00ff00' });
    harness.emit({
      type: 'annotations.deleted',
      page: PAGE,
      deleted: [{ kind: 'objectNumber', objectNumber: 20 }],
      origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: 51 },
      meta: { affectedPages: [], cacheDelta: null, changed: [] },
    } as unknown as DocumentEvent);

    expect(harness.capability.get(ref(20))).toBeNull();
    expect(harness.capability.selection.list().map((annotation) => annotation.ref)).toEqual([]);
  });

  it("a change on one page does not rebuild another page's items", async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21, { ref: { ...ref(21), page: PAGE2 }, page: PAGE2 })]);
    const before = harness.capability.listPageItems(PAGE2);

    harness.capability.selection.set([ref(20)]);
    harness.update.mockReturnValueOnce(deferred<unknown>().promise);
    void harness.capability.selection.update({ color: '#00ff00' });

    expect(harness.capability.listPageItems(PAGE2)).toBe(before);
  });
});

describe('typing is one change', () => {
  it('a refused typing change refuses every keystroke it carried and reports once', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    harness.capability.selection.set([ref(30)]);
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);
    harness.update
      .mockResolvedValueOnce({ annotation: freeText('Hello', { ...NO_FLAGS, print: false }) })
      .mockRejectedValueOnce(new Error('text write refused'));
    await harness.capability.selection.update({ print: false });

    harness.capability.draftContents(ref(30), 'Hello a');
    harness.capability.draftContents(ref(30), 'Hello ab');
    expect(harness.capability.get(ref(30))!.contents).toBe('Hello ab');
    await vi.advanceTimersByTimeAsync(300);

    expect(harness.capability.get(ref(30))!.contents).toBe('Hello');
    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0]![0].refs).toEqual([ref(30)]);
  });
});

describe('how a record with a pending change renders', () => {
  it("a pending restyle draws live after another session's update resets the preference", async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.selection.set([ref(20)]);
    harness.update.mockResolvedValueOnce({
      annotation: square(20, { color: '#ff0000' }),
    });
    await harness.capability.selection.update({ color: '#ff0000' });
    const pending = deferred<unknown>();
    harness.update.mockReturnValueOnce(pending.promise);

    const restyle = harness.capability.selection.update({ color: '#00ff00' });
    harness.emit(remoteUpdate(square(20, { color: '#ff0000', author: 'Bob' })));

    const item = () => harness.capability.listPageItems(PAGE).find(({ id }) => id === 'obj:20')!;
    expect(dataOf(harness.capability.get(ref(20))).color).toBe('#00ff00');
    expect(item().source).toBe('vector');

    pending.resolve({ annotation: square(20, { color: '#00ff00', author: 'Bob' }) });
    await restyle;
    // Answered: another session touched it, so the engine's raster is the truth again.
    expect(item().source).toBe('baked');
  });
});
