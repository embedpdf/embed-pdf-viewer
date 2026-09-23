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

import { annotationHarness, PAGE2 } from './harness';

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
    flags: NO_FLAGS,
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
    inReplyTo: null,
    replyType: null,
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
