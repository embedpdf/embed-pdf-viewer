import { isPluginError, toPageRef } from '@embedpdf/core';
import type { AnnotationFlags } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness, type FileAnnotation, dataOf } from './harness';
import { annotationKey } from '@embedpdf/core';

/**
 * The public verbs in the engine's own terms: `create` shows the new
 * annotation at once, writes the draft as given (what it leaves out is the
 * engine's default) and resolves with the engine's record after the confirmed
 * `onCreated`; the change events fire once per confirmed change.
 */

const PAGE = toPageRef(1);
const CROP = { left: 10, bottom: 20, right: 210, top: 320 }; // a non-zero origin, on purpose
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

const squareDTO = (objectNumber: number): FileAnnotation =>
  ({
    ref: { kind: 'objectNumber', page: PAGE, objectNumber },
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
    rect: { left: 40, bottom: 270, right: 60, top: 280 },
    box: { left: 40, bottom: 270, right: 60, top: 280 },
    color: '#000000',
    strokeWidth: 1,
    opacity: 1,
    interiorColor: null,
  }) as FileAnnotation;

/** A harness over a loaded document with no annotations yet. */
const createHarness = async () => {
  const harness = annotationHarness({ crop: CROP });
  await harness.load([]);
  return harness;
};

afterEach(() => vi.restoreAllMocks());

describe('create, update and delete', () => {
  it('shows at once, writes the draft as given, and resolves with the engine’s record after onCreated', async () => {
    const harness = await createHarness();
    harness.create.mockResolvedValueOnce({ annotation: squareDTO(42) });
    const order: string[] = [];
    harness.capability.onCreated((event) =>
      order.push(`created:${annotationKey(event.annotation.ref)}:${event.origin.kind}`),
    );

    const draft = {
      subtype: 'square',
      box: { x: 30, y: 40, width: 20, height: 10 },
      color: '#ff0000',
    } as const;
    const pending = harness.capability.create(PAGE, draft);
    // Shown at once, before the engine answers: the draft with the engine's defaults.
    const [id] = harness.model().order;
    const shown = harness.model().byId[id!]!.annotation;
    expect(shown).toMatchObject({ ...draft, strokeWidth: 1, opacity: 1, print: true });
    expect(harness.capability.isPending(shown.ref)).toBe(true);

    const { annotation } = await pending.then((result) => (order.push('resolved'), result));
    // Its key from the start is its key for life: the object number it took.
    expect(annotationKey(annotation.ref)).toBe(id);
    expect(order).toEqual([`created:${id}:local`, 'resolved']);
    expect(harness.applied[0]!.change).toEqual({
      ops: [
        expect.objectContaining({
          type: 'annotations.create',
          objectNumber: Number(id!.slice('obj:'.length)),
        }),
      ],
    });
    // The draft the engine saw: as given, with nothing added (its /NM is the engine's to write).
    const written = harness.create.mock.calls[0]![0];
    expect(written).toMatchObject(draft);
    expect(written).not.toHaveProperty('print');
    expect(written).not.toHaveProperty('nm');
    expect(harness.model().order).toEqual([id]);
    expect(harness.capability.isPending(annotation.ref)).toBe(false);
  });

  it('selects the new annotation at once when asked', async () => {
    const harness = await createHarness();
    harness.create.mockResolvedValueOnce({ annotation: squareDTO(43) });
    const pending = harness.capability.create(
      PAGE,
      { subtype: 'square', box: { x: 30, y: 40, width: 20, height: 10 } },
      undefined,
      { select: true },
    );
    const [id] = harness.model().order;
    expect(harness.model().selected).toEqual([id]);
    await pending;
    expect(harness.model().selected).toEqual([id]);
  });

  it('rejects with the plugin vocabulary: unknown page, a draft the engine refuses, engine failure', async () => {
    const harness = await createHarness();
    const box = { x: 0, y: 0, width: 10, height: 10 };
    await expect(
      harness.capability.create(toPageRef(99), { subtype: 'square', box }),
    ).rejects.toSatisfy((error) => isPluginError(error, 'not-found'));
    await expect(harness.capability.create(PAGE, { subtype: 'square' } as never)).rejects.toSatisfy(
      (error) => isPluginError(error, 'invalid-input'),
    );
    expect(harness.create).not.toHaveBeenCalled();

    harness.create.mockRejectedValueOnce(new Error('engine refused'));
    await expect(
      harness.capability.create(PAGE, {
        subtype: 'line',
        linePoints: { start: { x: 0, y: 0 }, end: { x: 50, y: 50 } },
      }),
    ).rejects.toSatisfy((error) => isPluginError(error, 'operation-failed'));
    expect(harness.model().order).toEqual([]); // the shown record was dropped
  });

  it('makes the same annotation again from a read, and refuses a kind the engine doesn’t know', async () => {
    const harness = await createHarness();
    harness.create.mockResolvedValueOnce({ annotation: squareDTO(42) });
    const { annotation: original } = await harness.capability.create(PAGE, {
      subtype: 'square',
      box: { x: 30, y: 40, width: 20, height: 10 },
    });
    const read = harness.capability.get(original.ref);
    if (read?.subtype !== 'square') throw new Error('the square reads back as a square');

    harness.create.mockResolvedValueOnce({ annotation: squareDTO(43) });
    const { annotation: copy } = await harness.capability.create(PAGE, { ...read, nm: null });
    // A new annotation under a number of its own.
    expect(annotationKey(copy.ref)).not.toBe(annotationKey(original.ref));
    const written = harness.create.mock.calls[1]![0];
    expect(written).toMatchObject({ subtype: 'square', color: read.color });

    await expect(
      harness.capability.create(PAGE, { ...read, subtype: 'unsupported' } as never),
    ).rejects.toSatisfy((error) => isPluginError(error, 'invalid-input'));
    expect(harness.create).toHaveBeenCalledTimes(2);
  });

  it('onUpdated and onDeleted fire once per confirmed change, carrying the engine’s record', async () => {
    const harness = await createHarness();
    harness.create.mockResolvedValueOnce({ annotation: squareDTO(5) });
    const { annotation } = await harness.capability.create(PAGE, {
      subtype: 'square',
      box: { x: 0, y: 0, width: 10, height: 10 },
    });
    const log: string[] = [];
    harness.capability.onUpdated((event) =>
      log.push(`updated:${annotationKey(event.annotation.ref)}:${event.origin.kind}`),
    );
    harness.capability.onDeleted((event) =>
      log.push(`deleted:${event.refs.map(annotationKey).join(',')}:${event.origin.kind}`),
    );

    harness.update.mockResolvedValueOnce({
      annotation: { ...squareDTO(5), opacity: 0.5 },
      appearance: { changed: false },
    });
    const updated = await harness.capability.update(annotation.ref, {
      subtype: 'square',
      opacity: 0.5,
    });
    expect(dataOf(updated.annotation).opacity).toBe(0.5);
    await harness.capability.delete(annotation.ref);
    const key = annotationKey(annotation.ref);
    expect(log).toEqual([`updated:${key}:local`, `deleted:${key}:local`]);
  });
});
