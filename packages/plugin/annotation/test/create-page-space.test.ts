import { isPluginError, toPageRef, type ControllerContext } from '@embedpdf/core';
import type { AnnotationDTO, AnnotationFlags, AnnotationRef } from '@embedpdf/engine-core/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { createAnnotationController } from '../src/controller';
import { annotationReducer, initialAnnotationState } from '../src/model';
import type { AnnotationAction, AnnotationState } from '../src/model';
import { annotationKey } from '../src/repository';

/**
 * Pilot C of the road-to-3.0 plan: the public page-space `create()` enters the
 * SAME optimistic commit path the draw tools use, resolves after the confirmed
 * `onCreated`, and the three change events fire once per confirmed fact.
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

function harness() {
  let state = initialAnnotationState();
  const create = vi.fn();
  const update = vi.fn();
  const remove = vi.fn(async (_ref: AnnotationRef) => ({}));
  const listeners = new Set<(event: unknown) => void>();
  const ctx = {
    cleanup: () => {},
    getState: () => state,
    dispatch: (action: AnnotationAction) => {
      state = annotationReducer(state, action);
    },
    document: () => ({ pages: [{ ref: PAGE, index: 0, boxes: { crop: CROP } }] }),
    doc: {
      page: () => ({ annotations: { create, update, delete: remove } }),
      events: {
        subscribe: (l: (e: unknown) => void) => (listeners.add(l), () => listeners.delete(l)),
      },
      security: {
        allows: () => true,
        identity: { user_id: 'me' },
        allowsAnnotationCreate: () => true,
        allowsAnnotationMutation: () => true,
        allowsAnnotationGroupAssignment: () => true,
      },
    },
    tryGet: () => null,
  } as unknown as ControllerContext<AnnotationState, AnnotationAction>;
  return {
    capability: createAnnotationController(ctx),
    create,
    update,
    remove,
    state: () => state,
  };
}

afterEach(() => vi.restoreAllMocks());

describe('create() in page space', () => {
  it('stages optimistically, writes a PDF-space draft with the crop offset applied, and resolves after onCreated', async () => {
    const h = harness();
    h.create.mockResolvedValueOnce({ created: squareDTO(42) });
    const order: string[] = [];
    h.capability.onCreated((e) =>
      order.push(`created:${annotationKey(e.ref)}:${e.origin.trigger}`),
    );

    const pending = h.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 30, y: 40, width: 20, height: 10 },
      props: { color: '#ff0000' },
    });
    // staged at once, before the engine answers
    expect(h.state().model.order.some((id) => id.startsWith('tmp:'))).toBe(true);

    const ref = await pending.then((r) => (order.push('resolved'), r));
    expect(annotationKey(ref)).toBe('obj:42');
    expect(order).toEqual(['created:obj:42:api', 'resolved']);
    // the draft the engine saw: page → PDF through the crop box, props applied
    expect(h.create.mock.calls[0]![0]).toMatchObject({
      subtype: 'square',
      rect: { left: 40, bottom: 270, right: 60, top: 280 },
      color: { r: 255, g: 0, b: 0 },
      flags: { print: true },
    });
    // reconciled: the optimistic id is gone, the durable record is in the model
    expect(h.state().model.order).toEqual(['obj:42']);
  });

  it('produces the same draft as the draw tool for the same geometry (one commit path)', async () => {
    const api = harness();
    api.create.mockResolvedValueOnce({ created: squareDTO(1) });
    await api.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 30, y: 40, width: 100, height: 60 },
    });

    const pointer = harness();
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
    const h = harness();
    await expect(
      h.capability.create({
        subtype: 'square',
        page: toPageRef(99),
        bounds: { x: 0, y: 0, width: 1, height: 1 },
      }),
    ).rejects.toSatisfy((e) => isPluginError(e, 'not-found'));
    await expect(
      h.capability.create({
        subtype: 'square',
        page: PAGE,
        bounds: { x: 0, y: 0, width: -1, height: 1 },
      }),
    ).rejects.toSatisfy((e) => isPluginError(e, 'invalid-input'));
    await expect(h.capability.create({ subtype: 'stamp', page: PAGE } as never)).rejects.toSatisfy(
      (e) => isPluginError(e, 'unsupported'),
    );

    h.create.mockRejectedValueOnce(new Error('engine refused'));
    await expect(
      h.capability.create({
        subtype: 'line',
        page: PAGE,
        from: { x: 0, y: 0 },
        to: { x: 50, y: 50 },
      }),
    ).rejects.toSatisfy((e) => isPluginError(e, 'operation-failed'));
    expect(h.state().model.order).toEqual([]); // the optimistic record was dropped
  });

  it('builds every supported geometry kind', async () => {
    const h = harness();
    h.create.mockResolvedValue({ created: squareDTO(7) });
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
    for (const input of inputs) await h.capability.create(input as never);
    expect(h.create.mock.calls.map((c) => (c[0] as { subtype: string }).subtype)).toEqual([
      'circle',
      'polygon',
      'polyline',
      'ink',
      'free-text',
      'highlight',
    ]);
  });

  it('onUpdated and onDeleted fire once per confirmed change, local and remote', async () => {
    const h = harness();
    h.create.mockResolvedValueOnce({ created: squareDTO(5) });
    const ref = await h.capability.create({
      subtype: 'square',
      page: PAGE,
      bounds: { x: 0, y: 0, width: 10, height: 10 },
    });
    const log: string[] = [];
    h.capability.onUpdated((e) => log.push(`updated:${e.origin.locality}`));
    h.capability.onDeleted((e) => log.push(`deleted:${annotationKey(e.ref)}:${e.origin.locality}`));

    h.update.mockResolvedValueOnce({ updated: squareDTO(5), appearance: { changed: false } });
    await h.capability.updateRaw(ref, { subtype: 'square', opacity: 0.5 });
    await h.capability.delete(ref);
    expect(log).toEqual(['updated:local', 'deleted:obj:5:local']);
  });
});
