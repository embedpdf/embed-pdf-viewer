/**
 * What the user sees while, and after, an engine write runs. A change shows
 * at once; when its write settles the view shows the engine's truth: the
 * confirmed record, including anything another session changed meanwhile.
 * Nothing is restored from a copy taken before the write.
 */
import type { DocumentEvent } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness, PAGE2, snapshotOf } from './harness';

const PAGE = toPageRef(1);
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
const BLACK = { r: 0, g: 0, b: 0 };

const ref = (annotObjectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  annotObjectNumber,
});

const square = (objectNumber: number, extra: Record<string, unknown> = {}): AnnotationDTO =>
  ({
    ref: ref(objectNumber),
    page: PAGE,
    index: objectNumber,
    identityQuality: 'durable',
    nm: null,
    ...NO_FLAGS,
    contents: null,
    subject: null,
    author: null,
    created: null,
    modified: null,
    blendMode: 'normal',
    subtype: 'square',
    rect: { left: 100, bottom: 700, right: 180, top: 760 },
    color: BLACK,
    interiorColor: null,
    opacity: 1,
    strokeWidth: 2,
    reply: null,
    popup: null,
    groupId: null,
    userId: null,
    createdBy: null,
    updatedBy: null,
    importedBy: null,
    actions: null,
    ...extra,
  }) as unknown as AnnotationDTO;

/** A direct-object annotation without /NM: the engine addresses it by position. */
const WEAK_REF: AnnotationRef = {
  kind: 'index',
  page: PAGE,
  index: 3,
  revision: { pageObjectNumber: 1, generation: 0 } as never,
};
const weakSquare = (): AnnotationDTO =>
  square(0, { ref: WEAK_REF, index: 3, identityQuality: 'weak' });

const freeText = (contents: string, extra: Record<string, unknown> = {}): AnnotationDTO =>
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
    rectDifferences: null,
    rect: { left: 100, bottom: 700, right: 300, top: 740 },
    ...extra,
  });

const remoteUpdate = (dto: AnnotationDTO): DocumentEvent =>
  ({
    type: 'annotation.updated',
    page: PAGE,
    origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: 50 },
    updated: dto,
    appearance: { changed: false },
    meta: {
      affectedPages: [],
      cacheDelta: null,
      changed: [],
      weakRefsInvalidated: false,
      shouldRefetch: null,
    },
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

describe('a refused write shows the truth', () => {
  it('a refused delete brings the annotation back', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.remove.mockRejectedValueOnce(new Error('revoked'));
    harness.capability.select(ref(20));

    const result = await harness.capability.deleteSelection();

    expect(result.failed.map((failure) => failure.ref)).toEqual([ref(20)]);
    expect(harness.capability.get(ref(20))).not.toBeNull();
  });

  it('a refused flags change reverts the flags', async () => {
    const harness = annotationHarness();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await harness.load([square(20)]);
    harness.update.mockRejectedValueOnce(new Error('Forbidden'));
    harness.capability.select(ref(20));

    const result = await harness.capability.updateSelectionFlags({ locked: true });

    expect(result.failed).toHaveLength(1);
    expect(harness.capability.get(ref(20))!.flags.locked).toBe(false);
  });

  it("a refused restyle shows the collaborator's change that landed meanwhile", async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = deferred<unknown>();
    harness.update.mockReturnValueOnce(write.promise);
    harness.capability.select(ref(20));

    const restyle = harness.capability.updateSelection({ color: '#00ff00' });
    expect(harness.capability.get(ref(20))!.props.color).toBe('#00ff00');
    harness.emit(remoteUpdate(square(20, { contents: 'from Bob' })));
    write.reject(new Error('Forbidden'));
    await restyle;

    const annotation = harness.capability.get(ref(20))!;
    expect(annotation.props.color).toBe('#000000');
    expect(annotation.contents).toBe('from Bob');
  });

  it('a partly refused restyle keeps what was written and reverts what was not', async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21)]);
    harness.update.mockImplementation(async (target: AnnotationRef) => {
      if (target.kind === 'objectNumber' && target.annotObjectNumber === 21) {
        throw new Error('Forbidden');
      }
      return { updated: square(20, { color: { r: 0, g: 255, b: 0 } }) };
    });
    harness.capability.select([ref(20), ref(21)]);

    const result = await harness.capability.updateSelection({ color: '#00ff00' });

    expect(result.failed.map((failure) => failure.ref)).toEqual([ref(21)]);
    expect(harness.capability.get(ref(20))!.props.color).toBe('#00ff00');
    expect(harness.capability.get(ref(21))!.props.color).toBe('#000000');
  });
});

describe('what the capability says about a write', () => {
  it('a refused change fires onWriteFailed with the annotations it carried', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);
    harness.update.mockRejectedValueOnce(new Error('Forbidden'));
    harness.capability.select(ref(20));

    await harness.capability.updateSelection({ color: '#00ff00' });

    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0]![0].refs).toEqual([ref(20)]);
  });

  it('an annotation is pending while its write runs, and raw stays the confirmed record', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = deferred<unknown>();
    harness.update.mockReturnValueOnce(write.promise);
    harness.capability.select(ref(20));

    const restyle = harness.capability.updateSelection({ color: '#00ff00' });
    expect(harness.capability.get(ref(20))!.pending).toBe(true);
    expect(harness.capability.get(ref(20))!.raw).toEqual(square(20));
    write.resolve({ updated: square(20, { color: { r: 0, g: 255, b: 0 } }) });
    await restyle;

    expect(harness.capability.get(ref(20))!.pending).toBeUndefined();
    expect(harness.capability.get(ref(20))!.props.color).toBe('#00ff00');
  });

  it('a refused create removes the new annotation and rejects', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    harness.create.mockRejectedValueOnce(new Error('Forbidden'));
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);

    const created = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    expect(harness.model().order).toEqual(['new:1']);

    await expect(created).rejects.toMatchObject({ code: 'operation-failed' });
    expect(harness.model().order).toEqual([]);
    expect(harness.model().selected).toEqual([]);
    expect(failures.mock.calls[0]![0].refs).toEqual([]);
  });
});

describe('typing', () => {
  it('an older echo never replaces newer typing, and the raw record is the confirmed one', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    const firstWrite = deferred<unknown>();
    harness.update.mockReturnValueOnce(firstWrite.promise);

    harness.capability.draftContents(ref(30), 'Hello w');
    await vi.advanceTimersByTimeAsync(300); // the debounced write of 'Hello w' starts
    expect(harness.update).toHaveBeenCalledTimes(1);
    harness.capability.draftContents(ref(30), 'Hello world');
    firstWrite.resolve({ updated: freeText('Hello w') });
    await vi.advanceTimersByTimeAsync(0);

    expect(harness.capability.get(ref(30))!.contents).toBe('Hello world');
    expect(harness.capability.getRaw(ref(30))!.contents).toBe('Hello w');
  });
});

describe('weak annotations (direct objects without /NM)', () => {
  it('an edit that makes the engine name the annotation keeps one record', async () => {
    const harness = annotationHarness();
    await harness.load([weakSquare()]);
    const named = { kind: 'nm', page: PAGE, nm: 'u-1' } as const;
    harness.update.mockResolvedValueOnce({
      updated: square(0, { ref: named, index: 3, nm: 'u-1', color: { r: 0, g: 255, b: 0 } }),
      appearance: { changed: true },
    });
    harness.capability.select(WEAK_REF);

    await harness.capability.updateSelection({ color: '#00ff00' });

    expect(harness.capability.list()).toHaveLength(1);
    expect(harness.capability.get(named)!.props.color).toBe('#00ff00');
    expect(harness.capability.getSelection()).toEqual([named]);
  });

  it('a deleted weak annotation does not come back', async () => {
    const harness = annotationHarness();
    await harness.load([weakSquare()]);
    harness.list.mockResolvedValue({ annotations: [] });
    harness.capability.select(WEAK_REF);

    await harness.capability.deleteSelection();
    await harness.capability.whenSynced();

    expect(harness.capability.list()).toHaveLength(0);
  });
});

describe('several changes to one record', () => {
  it('a flags write settling while typing waits keeps the typed text, and the text write sends it', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    harness.capability.select(ref(30));
    const locked = { ...NO_FLAGS, locked: true };

    harness.capability.draftContents(ref(30), 'Hello world'); // written after a pause
    harness.update.mockResolvedValueOnce({ updated: freeText('Hello', { flags: locked }) });
    await harness.capability.updateSelectionFlags({ locked: true });
    expect(harness.capability.get(ref(30))!.contents).toBe('Hello world');
    expect(harness.capability.get(ref(30))!.flags.locked).toBe(true);

    harness.update.mockResolvedValueOnce({ updated: freeText('Hello world', { flags: locked }) });
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.update.mock.calls[1]![1]).toMatchObject({
      subtype: 'free-text',
      richText: { paragraphs: [{ runs: [{ text: 'Hello world' }] }] },
    });
    expect(harness.capability.get(ref(30))!.contents).toBe('Hello world');
  });

  it("an update of another field while typing waits shows both: the typing and the update's result", async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    const moved = { left: 200, bottom: 600, right: 400, top: 640 };

    harness.capability.draftContents(ref(30), 'Hello world');
    harness.update.mockResolvedValueOnce({ updated: freeText('Hello', { rect: moved }) });
    await harness.capability.updateRaw(ref(30), { subtype: 'free-text', rect: moved } as never);

    const annotation = harness.capability.get(ref(30))!;
    expect(annotation.contents).toBe('Hello world');
    expect(annotation.raw!.rect).toEqual(moved);
    expect(annotation.bounds.x).toBeGreaterThan(150); // the moved box, not the one typing started in
  });

  it('two restyles settling out of order show the newer value', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(ref(20));
    const older = deferred<unknown>();
    harness.update
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ updated: square(20, { color: { r: 0, g: 0, b: 255 } }) });

    const red = harness.capability.updateSelection({ color: '#ff0000' });
    await harness.capability.updateSelection({ color: '#0000ff' });
    expect(harness.capability.get(ref(20))!.props.color).toBe('#0000ff');

    older.resolve({ updated: square(20, { color: { r: 0, g: 0, b: 255 } }) });
    await red;
    expect(harness.capability.get(ref(20))!.props.color).toBe('#0000ff');
  });

  it('an older write refused after a newer one succeeded shows the newer value', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(ref(20));
    const older = deferred<unknown>();
    harness.update
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce({ updated: square(20, { color: { r: 0, g: 0, b: 255 } }) });

    const red = harness.capability.updateSelection({ color: '#ff0000' });
    await harness.capability.updateSelection({ color: '#0000ff' });
    older.reject(new Error('Forbidden'));
    await red;

    expect(harness.capability.get(ref(20))!.props.color).toBe('#0000ff');
  });

  it('a slow older write never drops newer work', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(ref(20));
    const slow = deferred<unknown>();
    const newest = deferred<unknown>();
    harness.update
      .mockReturnValueOnce(slow.promise)
      .mockResolvedValueOnce({ updated: square(20, { color: { r: 0, g: 0, b: 255 } }) })
      .mockReturnValueOnce(newest.promise);

    const red = harness.capability.updateSelection({ color: '#ff0000' });
    await harness.capability.updateSelection({ color: '#0000ff' });
    void harness.capability.updateSelection({ color: '#00ff00' });
    slow.resolve({ updated: square(20, { color: { r: 255, g: 0, b: 0 } }) });
    await red;

    expect(harness.capability.get(ref(20))!.props.color).toBe('#00ff00');
  });
});

describe('a new record before the engine confirms it', () => {
  const createHeld = async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const create = deferred<unknown>();
    harness.create.mockReturnValueOnce(create.promise);
    const created = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    const confirm = () =>
      create.resolve({
        created: { ...square(60), nm: (harness.create.mock.calls[0]![0] as { nm: string }).nm },
      });
    return { harness, create, created, confirm };
  };

  it('an edit stays on screen, is written after the create, and the selection follows', async () => {
    const { harness, created, confirm } = await createHeld();
    harness.update.mockResolvedValueOnce({
      updated: square(60, { color: { r: 0, g: 255, b: 0 } }),
    });

    const restyle = harness.capability.updateSelection({ color: '#00ff00' });
    expect(harness.model().order).toEqual(['new:1']);
    expect(harness.model().byId['new:1']!.style.color).toBe('#00ff00');
    expect(harness.update).not.toHaveBeenCalled();

    confirm();
    await created;
    await restyle;
    expect(harness.update).toHaveBeenCalledTimes(1);
    expect(harness.update.mock.calls[0]![0]).toEqual(ref(60));
    expect(harness.model().selected).toEqual(['obj:60']);
    expect(harness.capability.get(ref(60))!.props.color).toBe('#00ff00');
  });

  it('a delete hides it for good: the engine deletes it after the create', async () => {
    const { harness, created, confirm } = await createHeld();

    const deleted = harness.capability.deleteSelection();
    expect(harness.model().order).toEqual([]);

    confirm();
    await created;
    await deleted;
    expect(harness.remove).toHaveBeenCalledWith(ref(60));
    expect(harness.model().order).toEqual([]);
  });

  it('a refused create drops the edit queued behind it and reports both', async () => {
    const { harness, create, created } = await createHeld();
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);

    const restyle = harness.capability.updateSelection({ color: '#00ff00' });
    create.reject(new Error('Forbidden'));
    await expect(created).rejects.toBeDefined();
    await restyle;

    expect(harness.model().order).toEqual([]);
    expect(harness.update).not.toHaveBeenCalled();
    expect(failures).toHaveBeenCalledTimes(2);
  });
});

describe('a weak record the engine names', () => {
  it('a second edit in flight stays visible on the renamed record', async () => {
    const harness = annotationHarness();
    await harness.load([weakSquare()]);
    harness.capability.select(WEAK_REF);
    const first = deferred<unknown>();
    const second = deferred<unknown>();
    harness.update.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const named = { kind: 'nm', page: PAGE, nm: 'u-1' } as const;

    const green = harness.capability.updateSelection({ color: '#00ff00' });
    const wide = harness.capability.updateSelection({ strokeWidth: 5 });
    first.resolve({
      updated: square(0, { ref: named, index: 3, nm: 'u-1', color: { r: 0, g: 255, b: 0 } }),
    });
    await green;

    expect(harness.capability.list()).toHaveLength(1);
    expect(harness.capability.get(named)!.props.strokeWidth).toBe(5);
    expect(harness.capability.getSelection()).toEqual([named]);

    second.resolve({
      updated: square(0, {
        ref: named,
        index: 3,
        nm: 'u-1',
        color: { r: 0, g: 255, b: 0 },
        strokeWidth: 5,
      }),
    });
    await wide;
    expect(harness.capability.list()).toHaveLength(1);
    expect(harness.capability.get(named)!.props).toMatchObject({
      color: '#00ff00',
      strokeWidth: 5,
    });
  });

  it('a delete whose page read fails stays hidden, reports the records stale, and a refresh shows the truth', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const harness = annotationHarness();
    await harness.load([weakSquare()]);
    harness.list.mockRejectedValueOnce(new Error('offline'));
    harness.capability.select(WEAK_REF);

    await harness.capability.deleteSelection();
    await harness.capability.whenSynced();
    expect(harness.capability.list()).toHaveLength(0);
    expect(harness.capability.getStatus()).toBe('error');

    await harness.load([]);
    expect(harness.capability.getStatus()).toBe('ready');
    expect(harness.capability.list()).toHaveLength(0);
    expect(harness.state().pending).toHaveLength(0);
  });
});

describe('what stays as it is', () => {
  it('a pending edit never brings back a record deleted elsewhere', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(ref(20));
    harness.update.mockReturnValueOnce(deferred<unknown>().promise);

    void harness.capability.updateSelection({ color: '#00ff00' });
    harness.emit({
      type: 'annotation.deleted',
      page: PAGE,
      deleted: { kind: 'objectNumber', value: 20 },
      origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: 51 },
      meta: {
        affectedPages: [],
        cacheDelta: null,
        changed: [],
        weakRefsInvalidated: false,
        shouldRefetch: null,
      },
    } as unknown as DocumentEvent);

    expect(harness.capability.get(ref(20))).toBeNull();
    expect(harness.capability.getSelection()).toEqual([]);
  });

  it("a change on one page does not rebuild another page's items", async () => {
    const harness = annotationHarness();
    await harness.load([square(20), square(21, { ref: { ...ref(21), page: PAGE2 }, page: PAGE2 })]);
    const before = harness.capability.listPageItems(PAGE2);

    harness.capability.select(ref(20));
    harness.update.mockReturnValueOnce(deferred<unknown>().promise);
    void harness.capability.updateSelection({ color: '#00ff00' });

    expect(harness.capability.listPageItems(PAGE2)).toBe(before);
  });
});

describe('a record whose key changes keeps everything that belongs to it', () => {
  const NAMED = { kind: 'nm', page: PAGE, nm: 'named-text' } as const;

  it('text waiting for its write is written under the new key when another write names a weak record', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello', { ref: WEAK_REF, index: 3 })]);
    harness.capability.select(WEAK_REF);
    harness.capability.draftContents(WEAK_REF, 'Hello world');
    const hidden = { ...NO_FLAGS, print: false };

    harness.update.mockResolvedValueOnce({
      updated: freeText('Hello', { ref: NAMED, index: 3, nm: 'named-text', flags: hidden }),
    });
    await harness.capability.updateSelectionFlags({ print: false });
    expect(harness.capability.get(NAMED)!.contents).toBe('Hello world');

    harness.update.mockResolvedValueOnce({
      updated: freeText('Hello world', { ref: NAMED, index: 3, nm: 'named-text', flags: hidden }),
    });
    await vi.advanceTimersByTimeAsync(300);
    expect(harness.update).toHaveBeenCalledTimes(2);
    expect(harness.update.mock.calls[1]![0]).toEqual(NAMED);
    expect(harness.capability.get(NAMED)!.contents).toBe('Hello world');
  });

  it('typing that goes on after the engine names the record is written once, after the pause', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello', { ref: WEAK_REF, index: 3 })]);
    harness.capability.select(WEAK_REF);
    harness.capability.draftContents(WEAK_REF, 'Hello world');
    const hidden = { ...NO_FLAGS, print: false };
    harness.update.mockResolvedValueOnce({
      updated: freeText('Hello', { ref: NAMED, index: 3, nm: 'named-text', flags: hidden }),
    });
    await harness.capability.updateSelectionFlags({ print: false });

    await vi.advanceTimersByTimeAsync(100);
    harness.capability.draftContents(NAMED, 'Hello world!');
    harness.update.mockResolvedValueOnce({
      updated: freeText('Hello world!', { ref: NAMED, index: 3, nm: 'named-text', flags: hidden }),
    });
    await vi.advanceTimersByTimeAsync(300);

    expect(harness.update).toHaveBeenCalledTimes(2);
    expect(harness.update.mock.calls[1]).toMatchObject([
      NAMED,
      { richText: { paragraphs: [{ runs: [{ text: 'Hello world!' }] }] } },
    ]);
    expect(harness.capability.get(NAMED)!.contents).toBe('Hello world!');
  });

  it('the text range follows a weak record the engine names', async () => {
    const harness = annotationHarness();
    await harness.load([freeText('Hello', { ref: WEAK_REF, index: 3 })]);
    harness.capability.select(WEAK_REF);
    harness.capability.beginTextEdit(WEAK_REF);
    harness.capability.setTextSelection(WEAK_REF, { start: 1, end: 3 });

    harness.update.mockResolvedValueOnce({
      updated: freeText('Hello', {
        ref: NAMED,
        index: 3,
        nm: 'named-text',
        ...NO_FLAGS,
        print: false,
      }),
    });
    await harness.capability.updateSelectionFlags({ print: false });

    expect(harness.state().textSelection).toEqual({ id: 'nm:1:named-text', start: 1, end: 3 });
    expect(harness.capability.getEditingRef()).toEqual(NAMED);
  });

  it('a create the engine confirms while a full load runs stays on screen and selected', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const load = deferred<unknown>();
    harness.listRawAll.mockReturnValueOnce(load.promise);
    const refreshed = harness.capability.refresh();
    harness.create.mockImplementationOnce(async (draft: { nm: string }) => ({
      created: { ...square(60), nm: draft.nm },
    }));

    const created = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(harness.model().order).toEqual(['obj:60']);
    expect(harness.capability.getSelection()).toEqual([ref(60)]);

    // The load read the page before the create: the create's event, queued
    // behind it, brings the record in.
    load.resolve(snapshotOf([]));
    await refreshed;
    await created;
    expect(harness.model().order).toEqual(['obj:60']);
    expect(harness.capability.getSelection()).toEqual([ref(60)]);
    expect(harness.state().pending).toEqual([]);
  });

  it('a write goes to the record at a position now, not to one the engine named away from it', async () => {
    const harness = annotationHarness();
    const B_REF: AnnotationRef = { ...WEAK_REF, index: 4 };
    await harness.load([
      weakSquare(),
      square(0, { ref: B_REF, index: 4, identityQuality: 'weak' }),
    ]);
    const A_NAMED = { kind: 'nm', page: PAGE, nm: 'annotation-a' } as const;
    harness.capability.select(WEAK_REF);
    harness.update.mockResolvedValueOnce({
      updated: square(0, {
        ref: A_NAMED,
        index: 3,
        nm: 'annotation-a',
        color: { r: 255, g: 0, b: 0 },
      }),
    });
    await harness.capability.updateSelection({ color: '#ff0000' });

    // An edit ahead of both moves A to position 2 and B into A's old position 3.
    const B_MOVED: AnnotationRef = {
      ...WEAK_REF,
      revision: { pageObjectNumber: 1, generation: 1 } as never,
    };
    await harness.load([
      square(0, { ref: A_NAMED, index: 2, nm: 'annotation-a' }),
      square(0, { ref: B_MOVED, index: 3, identityQuality: 'weak' }),
    ]);
    harness.capability.select(B_MOVED);
    harness.update.mockResolvedValueOnce({
      updated: square(0, { ref: B_MOVED, index: 3, color: { r: 0, g: 255, b: 0 } }),
    });
    await harness.capability.updateSelection({ color: '#00ff00' });

    expect(harness.update.mock.calls[1]![0]).toEqual(B_MOVED);
  });

  it('a new record deleted elsewhere before its create answered stays deleted', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const answer = deferred<unknown>();
    harness.create.mockReturnValueOnce(answer.promise);
    const created = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    const dto = { ...square(60), nm: (harness.create.mock.calls[0]![0] as { nm: string }).nm };
    const meta = {
      affectedPages: [],
      cacheDelta: null,
      changed: [],
      weakRefsInvalidated: false,
      shouldRefetch: null,
    };
    // The engine publishes the create before it answers (a cloud engine's event
    // can arrive well before the answer), then another session deletes it.
    harness.emit({
      type: 'annotation.created',
      page: PAGE,
      origin: { kind: 'local', sessionId: 'me', sub: null, ts: 0, serverId: null },
      created: dto,
      meta,
    } as unknown as DocumentEvent);
    expect(harness.capability.get(ref(60))).not.toBeNull();
    harness.emit({
      type: 'annotation.deleted',
      page: PAGE,
      deleted: { kind: 'objectNumber', value: 60 },
      origin: { kind: 'remote', sessionId: 'cloud:bob', sub: 'bob', ts: 0, serverId: 50 },
      meta,
    } as unknown as DocumentEvent);

    expect(harness.capability.get(ref(60))).toBeNull();
    expect(harness.model().order).toEqual([]);
    // The fake engine publishes its create again when it answers; stop looking here.
    answer.resolve({ created: dto });
    await created;
  });

  it("a link sync in progress keeps its parent's place in line when the engine names the parent", async () => {
    const harness = annotationHarness();
    await harness.load([weakSquare()]);
    const PARENT = { kind: 'nm', page: PAGE, nm: 'named-square' } as const;
    const FIRST = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
    const SECOND = { kind: 'uri', uri: 'https://www.cloudpdf.com/' } as const;
    const child = deferred<unknown>();
    harness.create.mockReturnValueOnce(child.promise);

    const first = harness.capability.links.set(WEAK_REF, FIRST);
    await vi.waitFor(() => expect(harness.create).toHaveBeenCalledTimes(1));
    // The engine names the parent while its first child is being written.
    harness.emit(remoteUpdate(square(0, { ref: PARENT, index: 3, nm: 'named-square' })));
    const second = harness.capability.links.set(PARENT, SECOND);
    await Promise.resolve();
    expect(harness.create).toHaveBeenCalledTimes(1);

    child.resolve({
      created: square(61, {
        subtype: 'link',
        target: FIRST,
        reply: { to: PARENT, type: 'group' },
        popup: null,
        groupId: null,
        userId: null,
        createdBy: null,
        updatedBy: null,
        importedBy: null,
        actions: null,
      }),
    });
    harness.update.mockResolvedValueOnce({
      updated: square(61, {
        subtype: 'link',
        target: SECOND,
        reply: { to: PARENT, type: 'group' },
        popup: null,
        groupId: null,
        userId: null,
        createdBy: null,
        updatedBy: null,
        importedBy: null,
        actions: null,
      }),
    });
    await first;
    await second;

    // The second sync ran after the first, so it retargeted the child the first wrote.
    expect(harness.create).toHaveBeenCalledTimes(1);
    expect(harness.update).toHaveBeenCalledWith(
      ref(61),
      expect.objectContaining({ target: SECOND }),
    );
    expect(harness.capability.links.get(PARENT)).toEqual(SECOND);
  });

  it('a new record confirmed while a full load runs can be edited at once', async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const load = deferred<unknown>();
    harness.listRawAll.mockReturnValueOnce(load.promise);
    const refreshed = harness.capability.refresh();
    harness.create.mockImplementationOnce(async (draft: { nm: string }) => ({
      created: { ...square(60), nm: draft.nm },
    }));
    const created = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    harness.update.mockResolvedValueOnce({
      updated: square(60, { color: { r: 255, g: 0, b: 0 } }),
    });
    const restyled = harness.capability.updateSelection({ color: '#ff0000' });
    expect(harness.update).toHaveBeenCalledWith(ref(60), expect.anything());

    load.resolve(snapshotOf([]));
    await refreshed;
    await created;
    expect(await restyled).toMatchObject({ applied: [ref(60)], failed: [] });
    expect(harness.capability.get(ref(60))!.props.color).toBe('#ff0000');
  });

  it("a link set on a new record is written once the record's create is confirmed", async () => {
    const harness = annotationHarness();
    await harness.load([]);
    const create = deferred<unknown>();
    harness.create.mockReturnValueOnce(create.promise);
    const TARGET = { kind: 'uri', uri: 'https://www.embedpdf.com/' } as const;
    const created = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 10, y: 10, width: 50, height: 40 },
      select: true,
    });
    const linked = harness.capability.updateSelection({ link: TARGET });
    harness.create.mockResolvedValueOnce({
      created: square(61, {
        subtype: 'link',
        target: TARGET,
        reply: { to: ref(60), type: 'group' },
        popup: null,
        groupId: null,
        userId: null,
        createdBy: null,
        updatedBy: null,
        importedBy: null,
        actions: null,
      }),
    });

    create.resolve({
      created: { ...square(60), nm: (harness.create.mock.calls[0]![0] as { nm: string }).nm },
    });
    await created;
    await linked;

    expect(harness.create).toHaveBeenCalledTimes(2);
    expect(harness.create.mock.calls[1]![0]).toMatchObject({
      subtype: 'link',
      target: TARGET,
      reply: { to: ref(60), type: 'group' },
    });
    expect(harness.capability.links.get(ref(60))).toEqual(TARGET);
  });
});

describe('one engine write carrying several changes', () => {
  it('a refused text write refuses every keystroke it carried and reports once', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello')]);
    harness.capability.select(ref(30));
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);
    const flags = deferred<unknown>();
    harness.update.mockReturnValueOnce(flags.promise);
    const settingFlags = harness.capability.updateSelectionFlags({ print: false });

    harness.capability.draftContents(ref(30), 'Hello a');
    harness.capability.draftContents(ref(30), 'Hello ab');
    harness.update.mockRejectedValueOnce(new Error('text write refused'));
    await vi.advanceTimersByTimeAsync(300);

    expect(harness.capability.get(ref(30))!.contents).toBe('Hello');
    expect(failures).toHaveBeenCalledTimes(1);

    flags.resolve({ updated: freeText('Hello', { ...NO_FLAGS, print: false }) });
    await settingFlags;
    expect(harness.capability.get(ref(30))!.contents).toBe('Hello');
  });
  it('a refused write names its record by the key the record has now', async () => {
    vi.useFakeTimers();
    const harness = annotationHarness();
    await harness.load([freeText('Hello', { ref: WEAK_REF, index: 3 })]);
    const NAMED = { kind: 'nm', page: PAGE, nm: 'named-text' } as const;
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);
    harness.capability.select(WEAK_REF);
    harness.capability.draftContents(WEAK_REF, 'Hello world');
    harness.update.mockResolvedValueOnce({
      updated: freeText('Hello', {
        ref: NAMED,
        index: 3,
        nm: 'named-text',
        ...NO_FLAGS,
        print: false,
      }),
    });
    await harness.capability.updateSelectionFlags({ print: false });

    harness.update.mockRejectedValueOnce(new Error('text write refused'));
    await vi.advanceTimersByTimeAsync(300);

    expect(failures).toHaveBeenCalledTimes(1);
    expect(failures.mock.calls[0]![0].refs).toEqual([NAMED]);
  });
});

describe('how a record with a pending change renders', () => {
  it("a pending restyle stays live after another session's update resets the preference", async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(ref(20));
    harness.update.mockResolvedValueOnce({
      updated: square(20, { color: { r: 255, g: 0, b: 0 } }),
    });
    await harness.capability.updateSelection({ color: '#ff0000' });
    const pending = deferred<unknown>();
    harness.update.mockReturnValueOnce(pending.promise);

    const restyle = harness.capability.updateSelection({ color: '#00ff00' });
    harness.emit(remoteUpdate(square(20, { color: { r: 255, g: 0, b: 0 }, author: 'Bob' })));

    const item = () => harness.capability.listPageItems(PAGE).find(({ id }) => id === 'obj:20')!;
    expect(harness.capability.get(ref(20))!.props.color).toBe('#00ff00');
    expect(item().source).toBe('vector');

    pending.resolve({ updated: square(20, { color: { r: 0, g: 255, b: 0 }, author: 'Bob' }) });
    await restyle;
    // Settled: another session touched it, so the engine's raster is the truth again.
    expect(item().source).toBe('baked');
  });
});
