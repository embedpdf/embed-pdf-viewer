import { describe, expect, it, vi } from 'vitest';
import type { DocumentEvent, PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract/host';
import type { CapturedAnnotationDraft } from '@embedpdf/plugin-annotation/contract/host';
import {
  measureFromKnownLength,
  measureFromRatio,
  type PageMeasurementViewport,
  type PdfMeasure,
} from '@embedpdf/engine-core/runtime';
import { createMeasurementEffects } from './effects';
import { createMeasurementCapability } from './capability';
import { initialMeasurementState, measurementReducer } from './reducer';
import type { MeasurementAction, MeasurementState } from './types';
import { selectPageScale, withUnit } from './scale';

const crop = { left: -20, bottom: -40, right: 580, top: 760 };
const scale = measureFromKnownLength(100, { value: 3, unit: 'm' });

function harness(options: { allowed?: boolean; legacy?: boolean } = {}) {
  let state = initialMeasurementState;
  const cleanups: (() => void)[] = [];
  const storage: Record<number, PageMeasurementViewport[]> = { 1: [], 2: [] };
  const setPageViewports = vi.fn();
  const remeasurePage = vi.fn(async (pon: number, scale: PdfMeasure) => ({
    pon,
    scale,
    updated: [],
    skipped: [],
    failed: [],
  }));
  let onCapture: (e: CapturedAnnotationDraft) => void = () => {};
  let onEvent: (e: DocumentEvent) => void = () => {};
  const anno = {
    setPageViewports,
    remeasurePage,
    canCreate: () => true,
    onDraftCaptured: (cb: typeof onCapture) => {
      onCapture = cb;
      return () => {};
    },
  };
  const activateTool = vi.fn();
  const write = vi.fn(async (pon: number, measure: PdfMeasure) => {
    storage[pon] = [{ owned: true, bbox: crop, measure }];
  });
  const read = vi.fn(async (pon: number) => storage[pon]);
  const ctx = {
    getState: () => state,
    dispatch: (a: MeasurementAction) => {
      state = measurementReducer(state, a);
    },
    document: () => ({
      pages: [1, 2].map((pageObjectNumber) => ({
        pageObjectNumber,
        boxes: { crop },
        userUnit: pageObjectNumber,
      })),
    }),
    doc: {
      security: { allows: () => options.allowed !== false },
      page: (pon: number) => ({
        measure: options.legacy
          ? undefined
          : { viewports: () => read(pon), setScale: (m: PdfMeasure) => write(pon, m) },
      }),
      events: {
        subscribe: (cb: typeof onEvent) => {
          onEvent = cb;
          return () => {};
        },
      },
    },
    get: (token: unknown) => (token === AnnotationToken ? anno : { activateTool }),
    cleanup: (cb: () => void) => cleanups.push(cb),
    subscribe: () => () => {},
  } as unknown as PluginContext<MeasurementState, MeasurementAction>;
  const effects = createMeasurementEffects(ctx, {});
  const cap = createMeasurementCapability(ctx, {}, effects);
  effects.start();
  return {
    cap,
    state: () => state,
    write,
    read,
    storage,
    remeasurePage,
    setPageViewports,
    activateTool,
    event: (e: DocumentEvent) => onEvent(e),
    capture: (e: CapturedAnnotationDraft) => onCapture(e),
    dispose: () => cleanups.forEach((c) => c()),
  };
}
describe('measurement workflow', () => {
  it('writes the viewport, rereads, then optionally recalculates', async () => {
    const h = harness();
    await h.cap.prepare(1);
    const trace: string[] = [];
    h.write.mockImplementation(async (_pon, m) => {
      trace.push('write');
      h.storage[1] = [{ owned: true, bbox: crop, measure: m }];
    });
    h.read.mockImplementation(async (pon) => {
      trace.push('read');
      return h.storage[pon];
    });
    h.remeasurePage.mockImplementation(async (pon, scale) => {
      trace.push('remeasure');
      return { pon, scale, updated: [], skipped: [], failed: [] };
    });
    await h.cap.setPageScale(1, scale);
    expect(trace).toEqual(['write', 'read', 'remeasure']);
    expect(h.cap.pageScale(1)).toMatchObject({ source: 'owned', measure: scale });
    await h.cap.setPageScale(1, scale, { recalculate: false });
    expect(h.remeasurePage).toHaveBeenCalledTimes(1);
  });
  it('refuses calibration without the grant before changing state', async () => {
    const h = harness({ allowed: false });
    await h.cap.prepare(1);
    expect(h.cap.canCalibrate()).toBe(false);
    h.cap.startCalibration();
    expect(h.activateTool).not.toHaveBeenCalled();
    await expect(h.cap.setPageScale(1, scale)).rejects.toMatchObject({
      name: 'PermissionDenied',
      required: 'doc.annotate.modify',
    });
    expect(h.write).not.toHaveBeenCalled();
    expect(h.state().pending).toBe(0);
  });
  it('does not modify annotations after a failed viewport write; all-pages reports partial results', async () => {
    const h = harness();
    await h.cap.prepare(1);
    h.write.mockImplementation(async (pon) => {
      if (pon === 1) {
        throw new Error('denied');
      }
    });
    await expect(h.cap.setPageScale(1, scale)).rejects.toThrow('denied');
    expect(h.remeasurePage).not.toHaveBeenCalled();
    const reports = await h.cap.setPageScale(1, scale, { allPages: true });
    expect(reports[0]).toMatchObject({ pon: 1, scaleError: { message: 'denied' } });
    expect(reports[1]).toMatchObject({ pon: 2, updated: [] });
    expect(h.remeasurePage).toHaveBeenCalledTimes(1);
  });
  it('captures original PDF points and computes float32 user-space length', async () => {
    const h = harness();
    await h.cap.prepare(1);
    h.capture({ tool: 'calibrate', pon: 1, from: { x: -20, y: 20 }, to: { x: 80, y: 20 } });
    expect(h.cap.calibrationRequest()).toMatchObject({ pon: 1, userSpaceLength: 100 });
    expect(h.activateTool).toHaveBeenCalledWith('pointer');
    await h.cap.calibrate(1, { x: -20, y: 20 }, { x: 80, y: 20 }, { value: 3, unit: 'm' });
    expect(h.cap.pageScale(1).measure).toEqual(scale);
  });
  it('supports session-only engines and scales presets by each page UserUnit', async () => {
    const h = harness({ legacy: true });
    await h.cap.prepare(1);
    await h.cap.setPreset(1, 'metric-100', { allPages: true, recalculate: false });
    expect(h.write).not.toHaveBeenCalled();
    expect(h.cap.pageScale(2)).toMatchObject({
      persistent: false,
      source: 'owned',
      measure: measureFromRatio(1, 100, 'm', 2),
    });
  });
  it('ignores late reads after disposal', async () => {
    const h = harness();
    await Promise.all([h.cap.prepare(1), h.cap.prepare(2)]);
    let resolve!: (v: PageMeasurementViewport[]) => void;
    h.read.mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    h.event({ type: 'page.viewportsChanged', pageObjectNumber: 1 } as DocumentEvent);
    h.dispose();
    const before = h.state();
    resolve([{ owned: true, bbox: crop, measure: scale }]);
    await Promise.resolve();
    await Promise.resolve();
    expect(h.state()).toBe(before);
  });
  it('prefers owned calibration in the page display and preserves display conversion', () => {
    const foreign: PageMeasurementViewport = {
      owned: false,
      bbox: crop,
      measure: { subtype: 'GEO' },
    };
    expect(selectPageScale([foreign], crop, scale, true)).toMatchObject({
      source: 'foreign',
      measure: { subtype: 'GEO' },
    });
    expect(
      selectPageScale([{ owned: true, bbox: crop, measure: scale }, foreign], crop, scale, true)
        .source,
    ).toBe('owned');
    const converted = withUnit(scale, 'cm');
    expect(converted.x).toBe(scale.x);
    expect(converted.distance[0].conversion).toBe(100);
  });
});
