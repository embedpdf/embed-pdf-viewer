/**
 * The store's second door: a change stated in code (`store.apply`) shows at
 * once and is written, settled and refused exactly like a gesture's. The
 * write carries the pending change's own patch, as given.
 */
import { annotationKey, type AnnotationRef } from '@embedpdf/engine-core/runtime';
import { describe, expect, it, vi } from 'vitest';

import { annotationHarness, PAGE, type FileAnnotation, dataOf } from './harness';

const FLAGS = {
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

const refOf = (objectNumber: number): AnnotationRef => ({
  kind: 'objectNumber',
  page: PAGE,
  objectNumber,
});

const base = (objectNumber: number) => ({
  ref: refOf(objectNumber),
  page: PAGE,
  index: objectNumber,
  identityQuality: 'durable',
  nm: null,
  ...FLAGS,
  contents: null,
  subject: null,
  author: null,
  createdAt: null,
  modifiedAt: null,
  blendMode: 'normal',
  reply: null,
  popup: null,
  groupId: null,
  userId: null,
  createdBy: null,
  modifiedBy: null,
  importedBy: null,
  actions: null,
});

const square = (objectNumber: number, color = '#000000'): FileAnnotation =>
  ({
    ...base(objectNumber),
    subtype: 'square',
    rect: { left: 100, bottom: 600, right: 200, top: 660 },
    box: { left: 100, bottom: 600, right: 200, top: 660 },
    rotation: null,
    color,
    interiorColor: null,
    opacity: 1,
    strokeWidth: 1,
    borderStyle: 'solid',
    dashArray: null,
    cloudyIntensity: null,
  }) as unknown as FileAnnotation;

const stamp = (objectNumber: number): FileAnnotation =>
  ({
    ...base(objectNumber),
    subtype: 'stamp',
    rect: { left: 100, bottom: 600, right: 200, top: 660 },
    box: { left: 100, bottom: 600, right: 200, top: 660 },
    rotation: null,
    name: null,
    fit: 'contain',
    opacity: 1,
  }) as unknown as FileAnnotation;

/** An engine answer the test gives when it chooses. */
function held() {
  let resolve!: (value: unknown) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

describe('store.apply', () => {
  it('an update shows at once, and its write is the pending change’s own patch', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = held();
    harness.update.mockReturnValueOnce(write.promise);

    const patch = { subtype: 'square', color: '#00ff00' } as const;
    const done = harness.capability.update(refOf(20), patch);
    expect(dataOf(harness.capability.get(refOf(20))).color).toBe('#00ff00');
    const [pending] = harness.state().pending;
    expect(pending!.change).toMatchObject({ kind: 'edit', patch });
    expect(harness.update).toHaveBeenCalledWith(refOf(20), patch);
    expect(harness.update.mock.calls[0]![1]).toBe(
      pending!.change.kind === 'edit' && pending!.change.patch,
    );

    write.resolve({ annotation: square(20, '#00ff00') });
    await done;
    expect(harness.state().pending).toEqual([]);
    expect(dataOf(harness.capability.get(refOf(20))).color).toBe('#00ff00');
  });

  it('a code move keeps the raster and moves it with the shape; a code restyle draws live', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const before = harness.capability.listPageItems(PAGE)[0]!;
    expect(before.source).toBe('baked');
    const box = dataOf(harness.capability.get(refOf(20))).box as {
      x: number;
      y: number;
      width: number;
      height: number;
    };

    const moveWrite = held();
    harness.update.mockReturnValueOnce(moveWrite.promise);
    const moving = harness.capability.update(refOf(20), {
      subtype: 'square',
      box: { ...box, x: box.x + 200 },
    });
    // The pending view: the same raster, drawn at the moved box, never left behind.
    const moved = harness.capability.listPageItems(PAGE)[0]!;
    expect(moved.source).toBe('baked');
    expect(moved.apBox).toEqual({ ...before.apBox!, x: before.apBox!.x + 200 });
    const shifted = {
      ...square(20),
      rect: { left: 300, bottom: 600, right: 400, top: 660 },
      box: { left: 300, bottom: 600, right: 400, top: 660 },
    } as unknown as FileAnnotation;
    moveWrite.resolve({ annotation: shifted });
    await moving;

    harness.update.mockResolvedValueOnce({ annotation: { ...shifted, color: '#00ff00' } });
    await harness.capability.update(refOf(20), { subtype: 'square', color: '#00ff00' });
    expect(harness.capability.listPageItems(PAGE)[0]!.source).toBe('vector');
  });

  it('two changes to one record in one apply each settle with their own write', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.update
      .mockResolvedValueOnce({ annotation: square(20, '#00ff00') })
      .mockResolvedValueOnce({ annotation: square(20, '#0000ff') });
    const applied = harness.apply([
      { type: 'update', ref: refOf(20), patch: { subtype: 'square', color: '#00ff00' } },
      { type: 'update', ref: refOf(20), patch: { subtype: 'square', color: '#0000ff' } },
    ]);
    expect(harness.state().pending).toHaveLength(2);
    const outcome = await applied.written;
    expect(harness.state().pending).toEqual([]);
    expect(outcome.annotations.map((annotation) => annotation && dataOf(annotation).color)).toEqual(
      ['#00ff00', '#0000ff'],
    );
  });

  it('repeated writes to one record where one fails: the right changes settle, each with its own answer', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.update
      .mockResolvedValueOnce({ annotation: square(20, '#00ff00') })
      .mockRejectedValueOnce(new Error('Forbidden'));
    const outcome = await harness.apply([
      { type: 'update', ref: refOf(20), patch: { subtype: 'square', color: '#00ff00' } },
      { type: 'update', ref: refOf(20), patch: { subtype: 'square', color: '#0000ff' } },
    ]).written;
    expect(harness.state().pending).toEqual([]);
    expect(outcome.failed).toHaveLength(1);
    expect(outcome.annotations[0] && dataOf(outcome.annotations[0]).color).toBe('#00ff00');
    expect(outcome.annotations[1]).toBeNull();
    // The view shows the engine's record: the change it accepted.
    expect(dataOf(harness.capability.get(refOf(20))).color).toBe('#00ff00');
  });

  it('an update resolves with its own write’s answer, never another change still on its way', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const green = held();
    const blue = held();
    harness.update.mockReturnValueOnce(green.promise).mockReturnValueOnce(blue.promise);
    const toGreen = harness.capability.update(refOf(20), { subtype: 'square', color: '#00ff00' });
    const toBlue = harness.capability.update(refOf(20), { subtype: 'square', color: '#0000ff' });
    green.resolve({ annotation: square(20, '#00ff00') });
    // Blue is still on its way (the view shows it) when green resolves.
    expect(dataOf((await toGreen).annotation).color).toBe('#00ff00');
    blue.reject(new Error('Forbidden'));
    await expect(toBlue).rejects.toMatchObject({ code: 'operation-failed' });
  });

  it('updateSelection moves a square by its rect, as update does', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(refOf(20));
    const read = dataOf(harness.capability.get(refOf(20)));
    const rect = read.rect as { x: number; y: number; width: number; height: number };
    const box = read.box as { x: number; y: number; width: number; height: number };
    harness.update.mockResolvedValueOnce({
      annotation: {
        ...square(20),
        rect: { left: 300, bottom: 600, right: 400, top: 660 },
        box: { left: 300, bottom: 600, right: 400, top: 660 },
      },
    });
    await harness.capability.updateSelection({ rect: { ...rect, x: rect.x + 200 } });
    const written = harness.update.mock.calls[0]![1];
    expect(written).toMatchObject({ subtype: 'square', box: { ...box, x: box.x + 200 } });
    expect(written).not.toHaveProperty('rect');
  });

  it('a rect with a new shape is refused the same way from the sidebar and the API', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.capability.select(refOf(20));
    const read = dataOf(harness.capability.get(refOf(20)));
    const rect = read.rect as { x: number; y: number; width: number; height: number };
    const box = read.box as { x: number; y: number; width: number; height: number };
    const conflict = { rect: { ...rect, x: rect.x + 200 }, box: { ...box, width: 10 } };
    await expect(harness.capability.updateSelection(conflict)).rejects.toMatchObject({
      code: 'invalid-input',
    });
    await expect(
      harness.capability.update(refOf(20), { subtype: 'square', ...conflict }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
    expect(harness.state().pending).toEqual([]);
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('a locked square unlocks from the sidebar and from the flags verb', async () => {
    type Harness = ReturnType<typeof annotationHarness>;
    const doors = [
      (harness: Harness) => harness.capability.updateSelection({ locked: false }),
      (harness: Harness) => harness.capability.updateSelectionFlags({ locked: false }),
    ];
    for (const unlock of doors) {
      const harness = annotationHarness();
      await harness.load([{ ...square(20), locked: true } as FileAnnotation]);
      harness.capability.select(refOf(20));
      harness.update.mockResolvedValueOnce({ annotation: square(20) });
      await unlock(harness);
      expect(harness.update.mock.calls[0]![1]).toEqual({ subtype: 'square', locked: false });
      expect(dataOf(harness.capability.get(refOf(20))).locked).toBe(false);
    }
  });

  it('a refused update is dropped at once: the engine’s record shows again', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = held();
    harness.update.mockReturnValueOnce(write.promise);

    const done = harness.capability.update(refOf(20), { subtype: 'square', color: '#00ff00' });
    write.reject(new Error('refused'));
    await expect(done).rejects.toThrow();
    expect(harness.state().pending).toEqual([]);
    expect(dataOf(harness.capability.get(refOf(20))).color).toBe('#000000');
  });

  it('an explicit `rect` is a command, written as given', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    harness.update.mockResolvedValueOnce({ annotation: square(20) });
    const patch = { subtype: 'square', rect: { x: 50, y: 50, width: 120, height: 80 } } as const;
    await harness.capability.update(refOf(20), patch);
    expect(harness.update).toHaveBeenCalledWith(refOf(20), patch);
  });

  it('a patch that says nothing, with no bytes, is no write at all', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const applied = harness.apply([
      { type: 'update', ref: refOf(20), patch: { subtype: 'square' } },
    ]);
    expect(applied.ids).toEqual(['obj:20']);
    expect(harness.state().pending).toEqual([]);
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('new bytes alone are a write: pending until it settles, refused like any other', async () => {
    const harness = annotationHarness();
    await harness.load([stamp(30)]);
    const drawing = new Uint8Array([1, 2, 3]);
    const change = {
      type: 'update',
      ref: refOf(30),
      patch: { subtype: 'stamp' },
      resources: { appearance: drawing },
    } as const;

    const accepted = held();
    harness.update.mockReturnValueOnce(accepted.promise);
    const first = harness.apply([change]);
    expect(harness.state().pending).toHaveLength(1);
    expect(harness.update).toHaveBeenCalledWith(
      refOf(30),
      { subtype: 'stamp' },
      {
        appearance: drawing,
      },
    );
    accepted.resolve({ annotation: stamp(30) });
    expect((await first.written).failed).toEqual([]);
    expect(harness.state().pending).toEqual([]);

    const refused = held();
    harness.update.mockReturnValueOnce(refused.promise);
    const second = harness.apply([change]);
    expect(harness.state().pending).toHaveLength(1);
    refused.reject(new Error('refused'));
    expect((await second.written).failed).toMatchObject([{ ids: ['obj:30'] }]);
    expect(harness.state().pending).toEqual([]);
  });

  it('a create shows at once under its name, and follows the engine’s ref', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = held();
    harness.create.mockReturnValueOnce(write.promise);

    const applied = harness.apply([
      {
        type: 'create',
        page: PAGE,
        draft: {
          subtype: 'text',
          rect: { x: 10, y: 10, width: 20, height: 20 },
          contents: 'Check',
        },
      },
    ]);
    const nm = harness.create.mock.calls[0]![0].nm as string;
    const [id] = applied.ids;
    expect(id).toBe(annotationKey({ kind: 'nm', page: PAGE, nm }));
    expect(harness.model().byId[id!]).toMatchObject({
      unconfirmed: true,
      annotation: { subtype: 'text', nm, contents: 'Check' },
    });

    const confirmed = {
      ...base(31),
      nm,
      subtype: 'text',
      rect: { left: 10, bottom: 770, right: 30, top: 790 },
      contents: 'Check',
      color: '#ffff00',
      opacity: 1,
      icon: 'note',
      open: false,
      state: null,
      stateModel: null,
    } as unknown as FileAnnotation;
    write.resolve({ annotation: confirmed });
    const outcome = await applied.written;
    expect(outcome.created[id!]).toEqual(refOf(31));
    expect(harness.model().byId['obj:31']).toBeDefined();
    expect(harness.model().byId[id!]).toBeUndefined();
  });

  it('a delete hides the record at once; a refused one brings it back', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    const write = held();
    harness.remove.mockReturnValueOnce(write.promise as never);

    const applied = harness.apply([{ type: 'delete', ref: refOf(20) }]);
    expect(harness.model().byId['obj:20']).toBeUndefined();
    write.reject(new Error('refused'));
    await applied.written;
    expect(harness.model().byId['obj:20']).toBeDefined();
  });

  it('a change the engine would refuse is refused before anything shows', async () => {
    const harness = annotationHarness();
    await harness.load([square(20)]);
    expect(() =>
      harness.apply([
        { type: 'update', ref: refOf(20), patch: { subtype: 'square', colour: '#f00' } as never },
      ]),
    ).toThrow(/colour/);
    expect(() =>
      harness.apply([{ type: 'update', ref: refOf(99), patch: { subtype: 'square' } }]),
    ).toThrow(/no annotation/);
    expect(harness.state().pending).toEqual([]);
    expect(harness.update).not.toHaveBeenCalled();
  });

  it('attached link children follow a parent updated in code, as they follow a gesture', async () => {
    const harness = annotationHarness();
    const child = {
      ...square(21),
      subtype: 'link',
      target: { kind: 'uri', uri: 'https://example.com' },
      reply: { to: refOf(20), type: 'group' },
    } as unknown as FileAnnotation;
    await harness.load([square(20), child]);
    harness.update.mockResolvedValueOnce({ annotation: square(20) });
    harness.update.mockResolvedValueOnce({ annotation: child });

    await harness.capability.update(refOf(20), {
      subtype: 'square',
      box: { x: 300, y: 140, width: 100, height: 60 },
    });
    await vi.waitFor(() => expect(harness.update).toHaveBeenCalledTimes(2));
    expect(harness.update.mock.calls[1]![0]).toEqual(refOf(21));
    expect(harness.update.mock.calls[1]![1]).toMatchObject({ subtype: 'link' });
  });
});
