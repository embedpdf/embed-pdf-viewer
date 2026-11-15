/**
 * `duplicate()`: copies of annotations in the same document, made by the
 * engine in one op (`annotations.copy`). The copies show at once, under the
 * object numbers the op gives them, and the engine's records replace them.
 */
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { annotationHarness, dataOf, PAGE, PAGE2, type FileAnnotation } from './harness';

const refOf = (objectNumber: number, page = PAGE): AnnotationRef => ({
  kind: 'objectNumber',
  page,
  objectNumber,
});

/** A square; in page space its box is `{ x, y: 100, width: 100, height: 60 }` on a 600 × 800 page. */
const square = (objectNumber: number, x = 100, extra: Record<string, unknown> = {}) =>
  ({
    ref: refOf(objectNumber),
    page: PAGE,
    hasAppearance: true,
    appearanceState: null,
    nm: `square-${objectNumber}`,
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
    contents: null,
    subject: null,
    author: 'Ada',
    createdAt: null,
    modifiedAt: null,
    blendMode: 'normal',
    subtype: 'square',
    rect: { left: x, bottom: 640, right: x + 100, top: 700 },
    box: { left: x, bottom: 640, right: x + 100, top: 700 },
    color: '#ff0000',
    strokeWidth: 2,
    opacity: 1,
    interiorColor: null,
    ...extra,
  }) as unknown as FileAnnotation;

/** A stamp; in page space its box is `{ x: 100, y: 140, width: 100, height: 60 }`. */
const stamp = (objectNumber: number, extra: Record<string, unknown> = {}) => {
  const rect = { left: 100, bottom: 600, right: 200, top: 660 };
  return {
    ref: refOf(objectNumber),
    page: PAGE,
    subtype: 'stamp',
    rect,
    box: rect,
    rotation: null,
    fit: 'contain',
    name: null,
    opacity: 1,
    hasAppearance: true,
    appearanceState: null,
    ...extra,
  } as unknown as FileAnnotation;
};

/** An attached link: a link grouped under the annotation it rides, over the same box. */
const linkOn = (objectNumber: number, parent: number) => {
  const {
    box: _box,
    color: _color,
    strokeWidth: _strokeWidth,
    opacity: _opacity,
    interiorColor: _interiorColor,
    ...base
  } = square(objectNumber) as unknown as Record<string, unknown>;
  return {
    ...base,
    hasAppearance: false,
    subtype: 'link',
    target: { kind: 'uri', uri: 'https://example.com' },
    actions: null,
    reply: { to: refOf(parent), type: 'group' },
  } as unknown as FileAnnotation;
};

/** A dimension line, with the measure given. */
const line = (objectNumber: number, measure: unknown, extra: Record<string, unknown> = {}) => {
  const {
    box: _box,
    interiorColor: _interiorColor,
    ...base
  } = square(objectNumber) as unknown as Record<string, unknown>;
  return {
    ...base,
    subtype: 'line',
    borderStyle: 'solid',
    intent: 'line-dimension',
    measure,
    captionEnabled: false,
    linePoints: { start: { x: 100, y: 670 }, end: { x: 200, y: 670 } },
    ...extra,
  } as unknown as FileAnnotation;
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('duplicate', () => {
  it('shows the copy at once, moved, and resolves with the engine’s record', async () => {
    const harness = annotationHarness();
    await harness.load([square(30)]);
    const answer = deferred<{ annotations: FileAnnotation[]; dropped: never[] }>();
    harness.copy.mockReturnValueOnce(answer.promise);

    const pending = harness.capability.duplicate([refOf(30)], { offset: { x: 10, y: 20 } });

    // Before the engine answers: the original's data, moved, under a new ref.
    const [original, id] = harness.model().order;
    expect(original).toBe('obj:30');
    const shown = harness.model().byId[id!]!;
    expect(shown.unconfirmed).toBe(true);
    expect(shown.annotation).toMatchObject({
      subtype: 'square',
      page: PAGE,
      box: { x: 110, y: 120, width: 100, height: 60 },
      color: '#ff0000',
      strokeWidth: 2,
      // The engine names it, and stamps who made it.
      nm: null,
      author: null,
    });
    expect(harness.model().selected).toEqual([]);
    // Named by the plugin's verb, as the page plugin's duplicate is `pages.duplicate`.
    expect(harness.pending()[0]!.label).toEqual({ key: 'annotation.duplicate', count: 1 });

    answer.resolve({
      annotations: [
        square(0, 110, {
          nm: 'copy',
          author: 'me',
          rect: { left: 110, bottom: 620, right: 210, top: 680 },
          box: { left: 110, bottom: 620, right: 210, top: 680 },
        }),
      ],
      dropped: [],
    });
    const { annotations, dropped } = await pending;

    // One change, one op: the engine made the copy.
    expect(harness.applied).toHaveLength(1);
    expect(harness.applied[0]!.change).toEqual({
      ops: [
        {
          type: 'annotations.copy',
          refs: [refOf(30)],
          offset: { x: 10, y: 20 },
          objectNumbers: [Number(id!.slice('obj:'.length))],
        },
      ],
    });
    expect(dropped).toEqual([]);
    expect(annotations.map((copy) => annotationKey(copy.ref))).toEqual([id]);
    expect(annotations[0]).toMatchObject({ nm: 'copy', author: 'me' });
    const confirmed = harness.model().byId[id!]!;
    expect(confirmed.unconfirmed).toBeFalsy();
    expect(confirmed.annotation.nm).toBe('copy');
    expect(harness.model().order).toEqual(['obj:30', id]);
  });

  it('puts the copies on another page, at the same spot', async () => {
    const harness = annotationHarness();
    await harness.load([square(30)]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    void harness.capability.duplicate([refOf(30)], { page: 1 });

    const [, id] = harness.model().order;
    expect(harness.model().byId[id!]!.annotation).toMatchObject({
      page: PAGE2,
      ref: { page: PAGE2 },
      box: { x: 100, y: 100, width: 100, height: 60 },
    });
    expect(harness.applied[0]!.change).toMatchObject({
      ops: [{ type: 'annotations.copy', refs: [refOf(30)], page: PAGE2 }],
    });
  });

  it('selects the copies with `select`, and leaves the selection alone without it', async () => {
    const harness = annotationHarness();
    await harness.load([square(30)]);
    harness.capability.selection.select([refOf(30)]);
    harness.copy.mockReturnValue(new Promise(() => {}));

    void harness.capability.duplicate([refOf(30)]);
    expect(harness.model().selected).toEqual(['obj:30']);

    void harness.capability.duplicate([refOf(30)], { select: true });
    expect(harness.model().selected).toEqual([harness.model().order.at(-1)]);
  });

  it('copies of a group are a group of their own', async () => {
    const harness = annotationHarness();
    await harness.load([
      square(30),
      square(31, 300, { reply: { to: refOf(30), type: 'group' } }),
      square(32, 450, { reply: { to: refOf(30), type: 'group' } }),
    ]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    // The third member isn't named: it stays out, and so does the link to it.
    void harness.capability.duplicate([refOf(30), refOf(31)]);

    const [first, second] = harness.model().order.slice(3);
    expect(harness.model().byId[first!]!.annotation.reply ?? null).toBeNull();
    expect(harness.model().byId[second!]!.annotation.reply).toEqual({
      to: harness.model().byId[first!]!.annotation.ref,
      type: 'group',
    });
  });

  it('a group member copied alone stands alone', async () => {
    const harness = annotationHarness();
    await harness.load([square(30), square(31, 300, { reply: { to: refOf(30), type: 'group' } })]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    void harness.capability.duplicate([refOf(31)]);

    const id = harness.model().order.at(-1)!;
    expect(harness.model().byId[id]!.annotation.reply ?? null).toBeNull();
  });

  it('an annotation’s link comes along, and isn’t one of the copies it resolves', async () => {
    const harness = annotationHarness();
    const link = linkOn(31, 30);
    await harness.load([square(30), link]);
    harness.copy.mockResolvedValueOnce({ annotations: [square(0), link], dropped: [] });

    const pending = harness.capability.duplicate([refOf(30)], { select: true });

    const [parent, child] = harness.model().order.slice(2);
    expect(harness.applied[0]!.change).toMatchObject({
      ops: [{ type: 'annotations.copy', refs: [refOf(30), refOf(31)] }],
    });
    // The copy has the link, as the original has.
    expect(harness.capability.links.get(harness.model().byId[parent!]!.annotation.ref)).toEqual({
      kind: 'uri',
      uri: 'https://example.com',
    });
    expect(harness.model().byId[child!]!.annotation.reply).toEqual({
      to: harness.model().byId[parent!]!.annotation.ref,
      type: 'group',
    });
    expect(harness.model().selected).toEqual([parent]);

    const { annotations } = await pending;
    expect(annotations.map((copy) => annotationKey(copy.ref))).toEqual([parent]);
  });

  it('a link named with its annotation is copied once, as one of the copies named', async () => {
    const harness = annotationHarness();
    const link = linkOn(31, 30);
    await harness.load([square(30), link]);
    harness.copy.mockResolvedValueOnce({ annotations: [square(0), link], dropped: [] });

    const pending = harness.capability.duplicate([refOf(30), refOf(31)]);

    const [parent, child, ...more] = harness.model().order.slice(2);
    expect(more).toEqual([]);
    expect(harness.applied[0]!.change).toMatchObject({
      ops: [{ type: 'annotations.copy', refs: [refOf(30), refOf(31)] }],
    });
    expect(harness.model().byId[child!]!.annotation.reply).toEqual({
      to: harness.model().byId[parent!]!.annotation.ref,
      type: 'group',
    });

    const { annotations } = await pending;
    expect(annotations.map((copy) => annotationKey(copy.ref))).toEqual([parent, child]);
  });

  it('shows no copy of what the engine leaves out, and resolves why', async () => {
    const harness = annotationHarness();
    const unknown = { ...square(31), subtype: 'unsupported' } as unknown as FileAnnotation;
    await harness.load([square(30), unknown]);
    const dropped = [{ ref: refOf(31), reason: 'unsupported-kind' }];
    harness.copy.mockResolvedValueOnce({ annotations: [square(0)], dropped });

    const pending = harness.capability.duplicate([refOf(31), refOf(30)]);
    expect(harness.model().order).toHaveLength(3);

    const result = await pending;
    expect(result.dropped).toEqual(dropped);
    expect(result.annotations).toHaveLength(1);
    // The copy has the number the op gave the square, the second one named.
    const [id] = harness.model().order.slice(2);
    expect(harness.applied[0]!.change).toMatchObject({
      ops: [{ objectNumbers: [expect.any(Number), Number(id!.slice('obj:'.length))] }],
    });
    expect(annotationKey(result.annotations[0]!.ref)).toBe(id);
  });

  it('shows the copy without a field the engine leaves out of it', async () => {
    const harness = annotationHarness();
    // A measure no write can make: the engine copies the line without it, and says so.
    await harness.load([line(30, { subtype: 'geospatial' })]);
    const dropped = [{ ref: refOf(30), field: 'measure', reason: 'geospatial' }];
    const answer = deferred<{ annotations: FileAnnotation[]; dropped: typeof dropped }>();
    harness.copy.mockReturnValueOnce(answer.promise);

    const pending = harness.capability.duplicate([refOf(30)], { select: true });

    // At once: the line without its measure, selected.
    const [, id] = harness.model().order;
    expect(id).toBeDefined();
    expect(dataOf(harness.model().byId[id!]!.annotation)).toMatchObject({
      subtype: 'line',
      measure: null,
    });
    expect(harness.model().selected).toEqual([id]);

    answer.resolve({ annotations: [line(0, null)], dropped });
    const result = await pending;
    expect(result.dropped).toEqual(dropped);
    expect(result.annotations.map((copy) => annotationKey(copy.ref))).toEqual([id]);
    expect(harness.model().selected).toEqual([id]);
  });

  it('resolves and selects a copy that shows only when the engine answers', async () => {
    const harness = annotationHarness();
    // A measure no read gives: it stands in for a copy the view can't read as a create.
    await harness.load([line(30, { subtype: 'other' })]);
    const { selection } = harness.capability;
    selection.select([refOf(30)]);
    const answer = deferred<{ annotations: FileAnnotation[]; dropped: never[] }>();
    harness.copy.mockReturnValueOnce(answer.promise);

    const pending = selection.duplicate();

    // Nothing to show yet, so the selection stays where it was.
    expect(harness.model().order).toEqual(['obj:30']);
    expect(harness.model().selected).toEqual(['obj:30']);
    // Undoing it takes the copy away all the same.
    const { ops } = harness.applied[0]!.change as unknown as {
      ops: { objectNumbers: number[] }[];
    };
    const [number] = ops[0]!.objectNumbers;
    expect(harness.pending()[0]!.undo).toEqual([
      { type: 'annotations.delete', ref: refOf(number!) },
    ]);

    answer.resolve({ annotations: [line(0, null)], dropped: [] });
    const { annotations } = await pending;
    expect(annotations.map((copy) => annotationKey(copy.ref))).toEqual([`obj:${number}`]);
    expect(harness.model().order).toEqual(['obj:30', `obj:${number}`]);
    expect(harness.model().selected).toEqual([`obj:${number}`]);
  });

  it('leaves the selection alone when it moved on before such a copy shows', async () => {
    const harness = annotationHarness();
    await harness.load([line(30, { subtype: 'other' }), square(31, 300)]);
    const { selection } = harness.capability;
    selection.select([refOf(30)]);
    const answer = deferred<{ annotations: FileAnnotation[]; dropped: never[] }>();
    harness.copy.mockReturnValueOnce(answer.promise);

    const pending = selection.duplicate();
    selection.select([refOf(31)]);
    answer.resolve({ annotations: [line(0, null)], dropped: [] });

    expect((await pending).annotations).toHaveLength(1);
    expect(harness.model().order).toHaveLength(3);
    expect(harness.model().selected).toEqual(['obj:31']);
  });

  it('a refused copy takes the copies away, rejects, and names the originals', async () => {
    const harness = annotationHarness();
    await harness.load([square(30)]);
    harness.copy.mockRejectedValueOnce(new Error('Forbidden'));
    const failures = vi.fn();
    harness.capability.onWriteFailed(failures);

    const pending = harness.capability.duplicate([refOf(30)], { select: true });
    expect(harness.model().order).toHaveLength(2);

    await expect(pending).rejects.toMatchObject({ message: expect.stringContaining('Forbidden') });
    expect(harness.model().order).toEqual(['obj:30']);
    expect(harness.model().selected).toEqual([]);
    expect(failures.mock.calls[0]![0].refs).toEqual([refOf(30)]);
  });

  it('refuses without the right to create, an annotation that isn’t here, and nothing is no change', async () => {
    const harness = annotationHarness();
    await harness.load([square(30)]);

    await expect(harness.capability.duplicate([refOf(99)])).rejects.toMatchObject({
      code: 'not-found',
    });
    expect(await harness.capability.duplicate([])).toEqual({ annotations: [], dropped: [] });
    harness.allowsAnnotationCreate.mockReturnValue(false);
    await expect(harness.capability.duplicate([refOf(30)])).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(harness.applied).toEqual([]);
    expect(harness.model().order).toEqual(['obj:30']);
  });

  it('undoing it takes the copies away', async () => {
    const harness = annotationHarness();
    await harness.load([square(30), square(31, 300, { reply: { to: refOf(30), type: 'group' } })]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    void harness.capability.duplicate([refOf(30), refOf(31)]);
    const [change] = harness.pending();
    const copies = harness.model().order.slice(2);
    expect(change!.undo).toEqual(
      copies.map((id) => ({
        type: 'annotations.delete',
        ref: harness.model().byId[id]!.annotation.ref,
      })),
    );

    harness.ctx.changes.stage({
      label: { key: 'history.undo' },
      undoOf: change!.opId,
      shows: change!.undo,
    });
    expect(harness.model().order).toEqual(['obj:30', 'obj:31']);
  });
});

describe('canDuplicate', () => {
  it('needs the right to create, and no locked annotation', async () => {
    const harness = annotationHarness();
    const widget = { ...square(32), subtype: 'widget' } as unknown as FileAnnotation;
    await harness.load([square(30), square(31, 300, { locked: true }), widget]);
    const { capability } = harness;

    expect(capability.canDuplicate([refOf(30)])).toBe(true);
    expect(capability.canDuplicate([])).toBe(false);
    expect(capability.canDuplicate([refOf(99)])).toBe(false);
    // Its copy would be locked too.
    expect(capability.canDuplicate([refOf(30), refOf(31)])).toBe(false);
    // A copy leaves a form field's box out.
    expect(capability.canDuplicate([refOf(32)])).toBe(false);

    harness.allowsAnnotationCreate.mockReturnValue(false);
    expect(capability.canDuplicate([refOf(30)])).toBe(false);
  });

  it('code can still copy a locked annotation, and the copy is locked', async () => {
    const harness = annotationHarness();
    await harness.load([square(30, 100, { locked: true })]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    void harness.capability.duplicate([refOf(30)]);

    const id = harness.model().order.at(-1)!;
    expect(dataOf(harness.model().byId[id]!.annotation).locked).toBe(true);
  });
});

describe('selection.duplicate', () => {
  it('copies the selection 10 points right and down, and selects the copies', async () => {
    const harness = annotationHarness();
    await harness.load([square(30), square(31, 300)]);
    const { selection } = harness.capability;
    expect(selection.canDuplicate()).toBe(false);
    selection.select([refOf(30), refOf(31)]);
    expect(selection.canDuplicate()).toBe(true);
    harness.copy.mockResolvedValueOnce({
      annotations: [square(0, 110), square(0, 310)],
      dropped: [],
    });

    const pending = selection.duplicate();

    const copies = harness.model().order.slice(2);
    expect(harness.applied[0]!.change).toMatchObject({
      ops: [{ type: 'annotations.copy', refs: [refOf(30), refOf(31)], offset: { x: 10, y: 10 } }],
    });
    expect(harness.model().selected).toEqual(copies);
    expect(dataOf(harness.model().byId[copies[0]!]!.annotation).box).toEqual({
      x: 110,
      y: 110,
      width: 100,
      height: 60,
    });

    const { annotations } = await pending;
    expect(annotations.map((copy) => annotationKey(copy.ref))).toEqual(copies);
    expect(harness.model().selected).toEqual(copies);
  });

  it('goes left or up where a copy would leave the page', async () => {
    const harness = annotationHarness();
    // Against the right edge of the 600-point page, and against its bottom.
    const corner = {
      rect: { left: 495, bottom: 5, right: 595, top: 65 },
      box: { left: 495, bottom: 5, right: 595, top: 65 },
    };
    await harness.load([square(30, 495, corner)]);
    harness.capability.selection.select([refOf(30)]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    void harness.capability.selection.duplicate();

    expect(harness.applied[0]!.change).toMatchObject({
      ops: [{ offset: { x: -10, y: -10 } }],
    });
  });

  it('takes the offset it is given', async () => {
    const harness = annotationHarness();
    await harness.load([square(30)]);
    harness.capability.selection.select([refOf(30)]);
    harness.copy.mockReturnValueOnce(new Promise(() => {}));

    void harness.capability.selection.duplicate({ offset: { x: 0, y: 40 } });

    expect(harness.applied[0]!.change).toMatchObject({ ops: [{ offset: { x: 0, y: 40 } }] });
  });

  it('is false while a locked annotation is selected', async () => {
    const harness = annotationHarness();
    await harness.load([square(30), square(31, 300, { locked: true })]);
    const { selection } = harness.capability;
    selection.select([refOf(30), refOf(31)]);
    expect(selection.canDuplicate()).toBe(false);
    selection.select([refOf(30)]);
    expect(selection.canDuplicate()).toBe(true);
  });
});

describe('a copied stamp', () => {
  it('shows its original’s picture where the copy is, until the engine draws the copy', async () => {
    const harness = annotationHarness();
    await harness.load([stamp(30)]);
    const picture = {
      ref: refOf(30),
      mode: 'normal',
      state: null,
      rect: { x: 100, y: 140, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    await harness.capability.renderAppearances(PAGE, 1);
    const answer = deferred<{ annotations: FileAnnotation[]; dropped: never[] }>();
    harness.copy.mockReturnValueOnce(answer.promise);

    const pending = harness.capability.duplicate([refOf(30)], { offset: { x: 10, y: 10 } });

    const id = harness.model().order.at(-1)!;
    const copy = harness.model().byId[id]!.annotation.ref;
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(`obj:30@0|${id}@kept`);
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([
      { ...picture, version: 0 },
      { ...picture, ref: copy, rect: { x: 110, y: 150, width: 100, height: 60 }, version: 0 },
    ]);

    // The engine's record has its own picture.
    const moved = { left: 110, bottom: 590, right: 210, top: 650 };
    answer.resolve({ annotations: [stamp(0, { rect: moved, box: moved })], dropped: [] });
    await pending;
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(`obj:30@0|${id}@1`);
  });

  it('a copy of a copy shows that picture too, before the engine wrote either', async () => {
    const harness = annotationHarness();
    await harness.load([stamp(30)]);
    const picture = {
      ref: refOf(30),
      mode: 'normal',
      state: null,
      rect: { x: 100, y: 140, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    await harness.capability.renderAppearances(PAGE, 1);
    harness.copy.mockReturnValue(new Promise(() => {}));

    // Ctrl/Cmd+D twice: the second copies the first copy, which is on its way.
    const { selection } = harness.capability;
    selection.select([refOf(30)]);
    void selection.duplicate();
    void selection.duplicate();

    const [, first, second] = harness.model().order;
    expect(harness.model().selected).toEqual([second]);
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(
      `obj:30@0|${first}@kept|${second}@kept`,
    );
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([
      { ...picture, version: 0 },
      {
        ...picture,
        ref: harness.model().byId[first!]!.annotation.ref,
        rect: { x: 110, y: 150, width: 100, height: 60 },
        version: 0,
      },
      {
        ...picture,
        ref: harness.model().byId[second!]!.annotation.ref,
        rect: { x: 120, y: 160, width: 100, height: 60 },
        version: 0,
      },
    ]);
  });

  it('a copy of a copy keeps its picture when the engine writes the first copy', async () => {
    const harness = annotationHarness();
    await harness.load([stamp(30)]);
    const picture = {
      ref: refOf(30),
      mode: 'normal',
      state: null,
      rect: { x: 100, y: 140, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    await harness.capability.renderAppearances(PAGE, 1);
    const firstAnswer = deferred<{ annotations: FileAnnotation[]; dropped: never[] }>();
    harness.copy.mockReturnValueOnce(firstAnswer.promise);
    harness.copy.mockReturnValue(new Promise(() => {}));

    const { selection } = harness.capability;
    selection.select([refOf(30)]);
    const written = selection.duplicate();
    void selection.duplicate();
    const [, first, second] = harness.model().order;
    const firstRef = harness.model().byId[first!]!.annotation.ref;
    const secondRef = harness.model().byId[second!]!.annotation.ref;
    const secondBox = { x: 120, y: 160, width: 100, height: 60 };

    // The engine writes the first copy. Its record no longer says what it copies, and its own
    // picture isn't loaded: the second copy, still on its way, shows the original's.
    const moved = { left: 110, bottom: 590, right: 210, top: 650 };
    firstAnswer.resolve({ annotations: [stamp(0, { rect: moved, box: moved })], dropped: [] });
    await written;
    expect(harness.model().byId[second!]!.unconfirmed).toBe(true);
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(`obj:30@0|${first}@1|${second}@kept`);
    const firstPicture = {
      ...picture,
      ref: firstRef,
      rect: { x: 110, y: 150, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture, firstPicture] });
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([
      { ...picture, version: 0 },
      { ...firstPicture, version: 1 },
      { ...picture, ref: secondRef, rect: secondBox, version: 0 },
    ]);

    // The first copy's own picture is loaded now, and it is the nearer one: the second shows it.
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([
      { ...picture, version: 0 },
      { ...firstPicture, version: 1 },
      { ...firstPicture, ref: secondRef, rect: secondBox, version: 0 },
    ]);
  });

  it('a copy of a copy the engine just wrote shows the picture behind it', async () => {
    const harness = annotationHarness();
    await harness.load([stamp(30)]);
    const picture = {
      ref: refOf(30),
      mode: 'normal',
      state: null,
      rect: { x: 100, y: 140, width: 100, height: 60 },
      image: { objectUrl: () => null, blob: () => null },
    };
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    await harness.capability.renderAppearances(PAGE, 1);
    const moved = { left: 110, bottom: 590, right: 210, top: 650 };
    harness.copy.mockResolvedValueOnce({
      annotations: [stamp(0, { rect: moved, box: moved })],
      dropped: [],
    });
    harness.copy.mockReturnValue(new Promise(() => {}));

    // The first copy is written, and copied again before its own picture is loaded.
    const { selection } = harness.capability;
    selection.select([refOf(30)]);
    await selection.duplicate();
    void selection.duplicate();

    const [, first, second] = harness.model().order;
    expect(harness.model().byId[first!]!.unconfirmed).toBeFalsy();
    expect(harness.capability.getAppearanceEpoch(PAGE)).toBe(`obj:30@0|${first}@1|${second}@kept`);
    harness.renderAppearances.mockResolvedValueOnce({ appearances: [picture] });
    expect(await harness.capability.renderAppearances(PAGE, 1)).toEqual([
      { ...picture, version: 0 },
      {
        ...picture,
        ref: harness.model().byId[second!]!.annotation.ref,
        rect: { x: 120, y: 160, width: 100, height: 60 },
        version: 0,
      },
    ]);
  });
});
