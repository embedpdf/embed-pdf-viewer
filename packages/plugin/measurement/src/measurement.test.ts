import type { PluginContext } from '@embedpdf/core';
import { toPageRef } from '@embedpdf/engine-core/runtime';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import { describe, expect, it, vi } from 'vitest';

import { createMeasurementCapability } from './controller';
import {
  initialMeasurementState,
  measurementReducer,
  type MeasurementAction,
  type MeasurementState,
} from './model';

const PAGE = toPageRef(1);
const layout = {
  index: 0,
  ref: PAGE,
  size: { width: 600, height: 800 },
  userUnit: 1,
  boxes: { crop: { left: 0, bottom: 0, right: 600, top: 800 } },
};

/** A store + context stub over a page whose scale the test controls (no engine measure service). */
function harness(opts: { allowed?: boolean; canCreate?: boolean } = {}) {
  let state: MeasurementState = initialMeasurementState();
  const annotation = {
    canCreate: () => opts.canCreate ?? true,
    setPageViewports: vi.fn(),
    remeasurePage: vi.fn(async (page: unknown, scale: unknown) => ({
      page,
      scale,
      updated: [],
      skipped: [],
      failed: [],
    })),
    onDraftCaptured: () => () => {},
    getRaw: () => null,
    create: vi.fn(async () => ({ kind: 'objectNumber', annotObjectNumber: 9, page: PAGE })),
  };
  const interaction = { activateTool: vi.fn() };
  const ctx = {
    doc: {
      security: { allows: () => opts.allowed ?? true },
      page: () => ({ measure: undefined }),
      events: { subscribe: () => () => {} },
    },
    getState: () => state,
    dispatch: (action: MeasurementAction) => {
      state = measurementReducer(state, action);
    },
    subscribe: () => () => {},
    document: () => ({ pages: [layout] }),
    get: (token: unknown) => {
      if (token === AnnotationToken) return annotation;
      if (token === InteractionToken) return interaction;
      throw new Error('unexpected capability');
    },
    tryGet: () => null,
    cleanup: () => {},
  } as unknown as PluginContext<MeasurementState, MeasurementAction>;
  return { capability: createMeasurementCapability(ctx), annotation, interaction };
}
const settle = () => new Promise((r) => setTimeout(r));

describe('measurement', () => {
  it('reads the page scale once loaded and measures in page space', async () => {
    const { capability } = harness();
    await settle();
    expect(capability.getPageScale(PAGE).ready).toBe(true);
    expect(capability.canMeasure(PAGE)).toBe(true);
    const readout = capability.measureDistance(PAGE, { x: 0, y: 0 }, { x: 72, y: 0 });
    expect('unavailable' in readout).toBe(false);
    if (!('unavailable' in readout)) expect(readout.kind).toBe('distance');
  });

  it('calibrates from two page points, reports, and announces the change', async () => {
    const { capability, annotation } = harness();
    await settle();
    const changes: unknown[] = [];
    capability.onScaleChanged((e) => changes.push(e.page));
    const completed: unknown[] = [];
    capability.onCalibrationCompleted((e) => completed.push(e.page));
    const reports = await capability.calibrate({
      page: PAGE,
      from: { x: 0, y: 10 },
      to: { x: 72, y: 10 },
      distance: { value: 1, unit: 'm' },
    });
    expect(reports).toHaveLength(1);
    expect(annotation.remeasurePage).toHaveBeenCalledOnce();
    expect(changes).toEqual([PAGE]);
    expect(completed).toEqual([PAGE]);
    expect(capability.getPageScale(PAGE).source).toBe('owned');
  });

  it('refuses scale writes without authority and unknown presets', async () => {
    const denied = harness({ allowed: false });
    await settle();
    await expect(denied.capability.clearScale(PAGE)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    const { capability } = harness();
    await settle();
    await expect(capability.setPreset(PAGE, 'nope')).rejects.toMatchObject({ code: 'not-found' });
  });

  it('creates a measurement annotation through the annotation plugin', async () => {
    const { capability, annotation } = harness();
    await settle();
    await capability.createMeasurement({
      kind: 'distance',
      page: PAGE,
      points: [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ],
    });
    expect(annotation.create).toHaveBeenCalledWith(
      expect.objectContaining({ subtype: 'line', tool: 'distance', page: PAGE }),
    );
    await expect(
      capability.createMeasurement({ kind: 'distance', page: PAGE, points: [{ x: 0, y: 0 }] }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('arms and dismisses the calibrate flow', async () => {
    const { capability, interaction } = harness();
    capability.startCalibration();
    expect(interaction.activateTool).toHaveBeenCalledWith('calibrate');
    const dismissed: unknown[] = [];
    capability.onCalibrationDismissed(() => dismissed.push(1));
    capability.dismissCalibration(); // nothing pending: silent
    expect(dismissed).toEqual([]);
  });
});
