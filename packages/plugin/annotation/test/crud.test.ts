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
    index: objectNumber,
    identityQuality: 'durable',
    hasAppearance: true,
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
      order.push(`created:${annotationKey(event.annotation.ref)}:${event.origin.locality}`),
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
    expect(annotationKey(annotation.ref)).toBe('obj:42');
    expect(order).toEqual(['created:obj:42:local', 'resolved']);
    // The draft the engine saw: as given, named, and nothing added.
    const written = harness.create.mock.calls[0]![0];
    expect(written).toMatchObject(draft);
    expect(written).not.toHaveProperty('print');
    expect(typeof written.nm).toBe('string');
    // Confirmed: the name's key is gone, the durable record is in the model.
    expect(harness.model().order).toEqual(['obj:42']);
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
    expect(harness.model().selected).toEqual(harness.model().order);
    await pending;
    expect(harness.model().selected).toEqual(['obj:43']);
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

  it('onUpdated and onDeleted fire once per confirmed change, carrying the engine’s record', async () => {
    const harness = await createHarness();
    harness.create.mockResolvedValueOnce({ annotation: squareDTO(5) });
    const { annotation } = await harness.capability.create(PAGE, {
      subtype: 'square',
      box: { x: 0, y: 0, width: 10, height: 10 },
    });
    const log: string[] = [];
    harness.capability.onUpdated((event) =>
      log.push(`updated:${annotationKey(event.annotation.ref)}:${event.origin.locality}`),
    );
    harness.capability.onDeleted((event) =>
      log.push(`deleted:${annotationKey(event.ref)}:${event.origin.locality}`),
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
    expect(log).toEqual(['updated:obj:5:local', 'deleted:obj:5:local']);
  });
});
