import { isPluginError, toPageRef } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationFlags } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { annotationHarness } from './harness';
import { annotationKey } from '../src/repository';

/**
 * The public page-space `create()` takes the same optimistic path the draw
 * tools use, resolves after the confirmed `onCreated`, and the change events
 * fire once per confirmed change.
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

const squareDTO = (annotObjectNumber: number): AnnotationDTO =>
  ({
    ref: { kind: 'objectNumber', page: PAGE, annotObjectNumber },
    page: PAGE,
    index: annotObjectNumber,
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
    rect: { left: 40, bottom: 270, right: 60, top: 280 },
    color: { r: 0, g: 0, b: 0 },
    strokeWidth: 1,
    opacity: 1,
    interiorColor: null,
  }) as AnnotationDTO;

const createHarness = () => annotationHarness({ crop: CROP });

afterEach(() => vi.restoreAllMocks());

describe('create() in page space', () => {
  it('stages optimistically, writes a PDF-space draft with the crop offset applied, and resolves after onCreated', async () => {
    const harness = createHarness();
    harness.create.mockResolvedValueOnce({ created: squareDTO(42) });
    const order: string[] = [];
    harness.capability.onCreated((event) =>
      order.push(`created:${annotationKey(event.ref)}:${event.origin.locality}`),
    );

    const pending = harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 30, y: 40, width: 20, height: 10 },
      props: { color: '#ff0000' },
    });
    // staged at once, before the engine answers
    expect(harness.model().order.some((id) => id.startsWith('new:'))).toBe(true);

    const ref = await pending.then((ref) => (order.push('resolved'), ref));
    expect(annotationKey(ref)).toBe('obj:42');
    expect(order).toEqual(['created:obj:42:local', 'resolved']);
    // the draft the engine saw: page → PDF through the crop box, props applied
    expect(harness.create.mock.calls[0]![0]).toMatchObject({
      subtype: 'square',
      rect: { left: 40, bottom: 270, right: 60, top: 280 },
      color: { r: 255, g: 0, b: 0 },
      flags: { print: true },
    });
    // reconciled: the optimistic id is gone, the durable record is in the model
    expect(harness.model().order).toEqual(['obj:42']);
  });

  it('produces the same draft as the draw tool for the same geometry (one commit path)', async () => {
    const api = createHarness();
    api.create.mockResolvedValueOnce({ created: squareDTO(1) });
    await api.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 30, y: 40, width: 100, height: 60 },
    });

    const pointer = createHarness();
    pointer.create.mockResolvedValueOnce({ created: squareDTO(2) });
    pointer.capability.createPointer('square', 'down', PAGE, { x: 30, y: 40 });
    pointer.capability.createPointer('square', 'move', PAGE, { x: 130, y: 100 });
    pointer.capability.createPointer('square', 'up', PAGE, { x: 130, y: 100 }, true);
    await vi.waitFor(() => expect(pointer.create).toHaveBeenCalledTimes(1));

    const strip = (draft: Record<string, unknown>) => {
      const { nm: _nm, ...rest } = draft;
      return rest;
    };
    expect(strip(api.create.mock.calls[0]![0])).toEqual(strip(pointer.create.mock.calls[0]![0]));
  });

  it('rejects with the plugin vocabulary: unknown page, invalid geometry, unsupported subtype, engine failure', async () => {
    const harness = createHarness();
    await expect(
      harness.capability.create({
        subtype: 'square',
        page: toPageRef(99),
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).rejects.toSatisfy((error) => isPluginError(error, 'not-found'));
    await expect(
      harness.capability.create({
        subtype: 'square',
        page: PAGE,
        bounds: { x: 0, y: 0, width: -1, height: 1 },
      }),
    ).rejects.toSatisfy((error) => isPluginError(error, 'invalid-input'));
    await expect(
      harness.capability.create({ subtype: 'stamp', page: PAGE } as never),
    ).rejects.toSatisfy((error) => isPluginError(error, 'unsupported'));

    harness.create.mockRejectedValueOnce(new Error('engine refused'));
    await expect(
      harness.capability.create({
        subtype: 'line',
        page: PAGE,
        from: { x: 0, y: 0 },
        to: { x: 50, y: 50 },
      }),
    ).rejects.toSatisfy((error) => isPluginError(error, 'operation-failed'));
    expect(harness.model().order).toEqual([]); // the optimistic record was dropped
  });

  it('builds every supported geometry kind', async () => {
    const harness = createHarness();
    harness.create.mockResolvedValue({ created: squareDTO(7) });
    const inputs = [
      { subtype: 'circle', page: PAGE, bounds: { x: 0, y: 0, width: 10, height: 10 } },
      {
        subtype: 'polygon',
        page: PAGE,
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 5, y: 8 },
        ],
      },
      {
        subtype: 'polyline',
        page: PAGE,
        vertices: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
        ],
      },
      {
        subtype: 'ink',
        page: PAGE,
        strokes: [
          [
            { x: 0, y: 0 },
            { x: 5, y: 5 },
            { x: 9, y: 1 },
          ],
        ],
      },
      { subtype: 'free-text', page: PAGE, bounds: { x: 0, y: 0, width: 120, height: 40 } },
      {
        subtype: 'highlight',
        page: PAGE,
        quads: [
          {
            upperStart: { x: 0, y: 0 },
            upperEnd: { x: 10, y: 0 },
            lowerStart: { x: 0, y: 5 },
            lowerEnd: { x: 10, y: 5 },
          },
        ],
      },
    ] as const;
    for (const input of inputs) await harness.capability.create(input as never);
    expect(
      harness.create.mock.calls.map((call) => (call[0] as { subtype: string }).subtype),
    ).toEqual(['circle', 'polygon', 'polyline', 'ink', 'free-text', 'highlight']);
  });

  it('onUpdated and onDeleted fire once per confirmed change, local and remote', async () => {
    const harness = createHarness();
    harness.create.mockResolvedValueOnce({ created: squareDTO(5) });
    const ref = await harness.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    const log: string[] = [];
    harness.capability.onUpdated((event) => log.push(`updated:${event.origin.locality}`));
    harness.capability.onDeleted((event) =>
      log.push(`deleted:${annotationKey(event.ref)}:${event.origin.locality}`),
    );

    harness.update.mockResolvedValueOnce({ updated: squareDTO(5), appearance: { changed: false } });
    await harness.capability.updateRaw(ref, { subtype: 'square', opacity: 0.5 });
    await harness.capability.delete(ref);
    expect(log).toEqual(['updated:local', 'deleted:obj:5:local']);
  });
});
