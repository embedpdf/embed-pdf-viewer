import { describe, expect, it, vi } from 'vitest';
import { createEventHook, type PageInfo } from '@embedpdf/core';
import { createTestContext } from '@embedpdf/core/testing';
import { measureFromRatio, toPageRef } from '@embedpdf/engine-core/runtime';
import type { PageMeasurementViewport, PdfMeasure } from '@embedpdf/engine-core/runtime';
import {
  AnnotationToken,
  type CapturedAnnotationDraft,
} from '@embedpdf/plugin-annotation/contract/host';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';

import { createMeasurementController } from '../src/controller';
import { initialMeasurementState, type MeasurementState } from '../src/model';

const PAGE = toPageRef(1);
const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const LOCAL_ORIGIN = { kind: 'local', sessionId: 'session-a', sub: null, ts: 0, serverId: null };
const REMOTE_ORIGIN = { kind: 'remote', sessionId: 'session-b', sub: 'user-b', ts: 0, serverId: 3 };
const ONE_TO_HUNDRED = measureFromRatio(1, 100, 'm');

const owned = (measure: PdfMeasure): PageMeasurementViewport => ({
  bbox: CROP,
  name: 'EmbedPDF',
  owned: true,
  measure,
});

/**
 * A controller over one 600 × 800 page. With `engine: true` the page has a
 * measure service whose `setScale` publishes `page.viewportsChanged` before
 * resolving, like the real engines; without it scales are session-only.
 */
function harness(
  options: {
    allowed?: boolean;
    canCreate?: boolean;
    engine?: boolean;
    viewports?: PageMeasurementViewport[];
    failReads?: boolean;
  } = {},
) {
  const draftCaptured = createEventHook<CapturedAnnotationDraft>();
  const annotation = {
    canCreate: () => options.canCreate ?? true,
    setPageViewports: vi.fn(),
    remeasurePage: vi.fn(async (page: unknown, scale: unknown) => ({
      page,
      scale,
      updated: [],
      skipped: [],
      failed: [],
    })),
    onDraftCaptured: draftCaptured.on,
    getRaw: () => null,
    create: vi.fn(async () => ({ kind: 'objectNumber', annotObjectNumber: 9, page: PAGE })),
  };
  const interaction = { activateTool: vi.fn() };
  let engineViewports: PageMeasurementViewport[] = options.viewports ?? [];
  let failing = options.failReads ?? false;
  const service = {
    viewports: vi.fn(async () => {
      if (failing) throw new Error('viewport read failed');
      return engineViewports;
    }),
    setScale: vi.fn(async (measure: PdfMeasure | null) => {
      engineViewports = measure ? [owned(measure)] : [];
      ctx.emitDocumentEvent({
        type: 'page.viewportsChanged',
        page: PAGE,
        meta: null,
        origin: LOCAL_ORIGIN,
      } as never);
    }),
  };
  const ctx = createTestContext<MeasurementState>({
    id: 'measurement',
    state: initialMeasurementState(),
    pages: [{ ref: PAGE, size: { width: 600, height: 800 } }],
    capabilities: [
      [AnnotationToken, annotation],
      [InteractionToken, interaction],
    ],
    doc: {
      security: { allows: () => options.allowed ?? true },
      page: () => ({ measure: options.engine ? service : undefined }),
    } as never,
  });
  const measurement = ctx.connect(createMeasurementController(ctx, {}));
  return {
    ctx,
    measurement,
    annotation,
    interaction,
    service,
    draftCaptured,
    setEngineViewports: (next: PageMeasurementViewport[]) => {
      engineViewports = next;
    },
    failReads: (fail: boolean) => {
      failing = fail;
    },
  };
}
const settle = () => new Promise((resolve) => setTimeout(resolve));

describe('measurement', () => {
  it('reads the page scale once loaded and measures in page space', async () => {
    const { measurement } = harness();
    await settle();
    expect(measurement.getPageScale(PAGE).ready).toBe(true);
    expect(measurement.getPageScale(PAGE).persistent).toBe(false);
    expect(measurement.getPageScale(PAGE)).toBe(measurement.getPageScale(PAGE));
    expect(measurement.canMeasure(PAGE)).toBe(true);
    const readout = measurement.measureDistance(PAGE, { x: 0, y: 0 }, { x: 72, y: 0 });
    expect('unavailable' in readout).toBe(false);
    if (!('unavailable' in readout)) expect(readout.kind).toBe('distance');
  });

  it('calibrates from two page points, reports, and announces the change', async () => {
    const { measurement, annotation } = harness();
    await settle();
    const changes: unknown[] = [];
    measurement.onScaleChanged((event) => changes.push(event.page));
    const completed: unknown[] = [];
    measurement.onCalibrationCompleted((event) => completed.push(event.page));
    const reports = await measurement.calibrate({
      page: PAGE,
      from: { x: 0, y: 10 },
      to: { x: 72, y: 10 },
      distance: { value: 1, unit: 'm' },
    });
    expect(reports).toHaveLength(1);
    expect(measurement.listLastReports()).toBe(reports);
    expect(annotation.remeasurePage).toHaveBeenCalledOnce();
    expect(changes).toEqual([PAGE]);
    expect(completed).toEqual([PAGE]);
    expect(measurement.getPageScale(PAGE).source).toBe('owned');
    expect(measurement.isBusy()).toBe(false);
  });

  it('refuses scale writes without authority and unknown presets', async () => {
    const denied = harness({ allowed: false });
    await settle();
    await expect(denied.measurement.clearScale(PAGE)).rejects.toMatchObject({
      code: 'permission-denied',
    });
    const { measurement } = harness();
    await settle();
    await expect(measurement.setPreset(PAGE, 'nope')).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('creates a measurement annotation through the annotation plugin', async () => {
    const { measurement, annotation } = harness();
    await settle();
    await measurement.createMeasurement({
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
      measurement.createMeasurement({ kind: 'distance', page: PAGE, points: [{ x: 0, y: 0 }] }),
    ).rejects.toMatchObject({ code: 'invalid-input' });
  });

  it('arms and dismisses the calibrate flow', async () => {
    const { measurement, interaction } = harness();
    measurement.startCalibration();
    expect(interaction.activateTool).toHaveBeenCalledWith('calibrate');
    const dismissed: unknown[] = [];
    measurement.onCalibrationDismissed(() => dismissed.push(1));
    measurement.dismissCalibration(); // nothing pending: silent
    expect(dismissed).toEqual([]);
  });

  it('turns a captured calibrate draft into a pending request', async () => {
    const { measurement, interaction, draftCaptured } = harness();
    const requested: unknown[] = [];
    measurement.onCalibrationRequested((event) => requested.push(event.request));
    const dismissed: unknown[] = [];
    measurement.onCalibrationDismissed(() => dismissed.push(1));

    draftCaptured.emit({
      tool: 'calibrate',
      page: PAGE,
      from: { x: 0, y: 700 },
      to: { x: 72, y: 700 },
    });

    const request = measurement.getCalibrationRequest();
    expect(request).toMatchObject({ page: PAGE, from: { x: 0, y: 100 }, to: { x: 72, y: 100 } });
    expect(requested).toEqual([request]);
    expect(interaction.activateTool).toHaveBeenCalledWith('pointer');
    measurement.dismissCalibration();
    expect(measurement.getCalibrationRequest()).toBeNull();
    expect(dismissed).toEqual([1]);
  });
});

describe('page viewports from the engine', () => {
  it('loads every page on connect and hands the viewports to the annotation plugin', async () => {
    const { measurement, annotation, service } = harness({
      engine: true,
      viewports: [owned(ONE_TO_HUNDRED)],
    });
    expect(measurement.getPageScale(PAGE).ready).toBe(false);
    await settle();
    expect(service.viewports).toHaveBeenCalledOnce();
    expect(measurement.getPageScale(PAGE)).toMatchObject({
      source: 'owned',
      ready: true,
      persistent: true,
    });
    expect(annotation.setPageViewports).toHaveBeenCalledOnce();
    expect(annotation.setPageViewports).toHaveBeenCalledWith(
      PAGE,
      [owned(ONE_TO_HUNDRED)],
      expect.objectContaining({ subtype: 'RL' }),
    );
  });

  it('reads the viewports exactly once for its own scale change, and returns with the new scale', async () => {
    const { measurement, annotation, service } = harness({ engine: true });
    await settle();
    expect(service.viewports).toHaveBeenCalledTimes(1);

    await measurement.setScale(PAGE, ONE_TO_HUNDRED);

    expect(service.setScale).toHaveBeenCalledWith(ONE_TO_HUNDRED);
    expect(service.viewports).toHaveBeenCalledTimes(2);
    expect(measurement.getPageScale(PAGE)).toMatchObject({ source: 'owned', ready: true });
    expect(annotation.setPageViewports).toHaveBeenLastCalledWith(
      PAGE,
      [owned(ONE_TO_HUNDRED)],
      expect.anything(),
    );
    await settle();
    expect(service.viewports).toHaveBeenCalledTimes(2);
  });

  it('follows a scale change made in another session', async () => {
    const { ctx, measurement, annotation, setEngineViewports } = harness({ engine: true });
    await settle();
    expect(measurement.getPageScale(PAGE).source).toBe('default');

    setEngineViewports([owned(ONE_TO_HUNDRED)]);
    ctx.emitDocumentEvent({
      type: 'page.viewportsChanged',
      page: PAGE,
      meta: null,
      origin: REMOTE_ORIGIN,
    } as never);
    await settle();

    expect(measurement.getPageScale(PAGE).source).toBe('owned');
    expect(annotation.setPageViewports).toHaveBeenLastCalledWith(
      PAGE,
      [owned(ONE_TO_HUNDRED)],
      expect.anything(),
    );
  });

  it('reports a failed read on the page scale and clears it once a read succeeds', async () => {
    const { measurement, annotation, failReads } = harness({ engine: true, failReads: true });
    await settle();
    const failed = measurement.getPageScale(PAGE);
    expect(failed.ready).toBe(false);
    expect(failed.error?.message).toContain('viewport read failed');
    expect(measurement.canMeasure(PAGE)).toBe(false);
    expect(annotation.setPageViewports).not.toHaveBeenCalled();

    failReads(false);
    await measurement.ensureLoaded(PAGE);
    expect(measurement.getPageScale(PAGE)).toMatchObject({ ready: true, source: 'default' });
    expect(measurement.getPageScale(PAGE).error).toBeUndefined();
  });

  it('rejects loading a page that is not in the document', async () => {
    const { measurement } = harness({ engine: true });
    await expect(measurement.ensureLoaded(toPageRef(99))).rejects.toMatchObject({
      code: 'not-found',
    });
  });

  it('loads pages inserted after connect', async () => {
    const { ctx, measurement, service } = harness({ engine: true });
    await settle();
    expect(service.viewports).toHaveBeenCalledTimes(1);

    // Grow the test document's page registry, then wake the registry readers.
    const inserted = toPageRef(2);
    const pages = ctx.document()!.pages as PageInfo[];
    pages.push({ ...pages[0]!, index: 1, ref: inserted });
    (ctx.document() as { pages: readonly PageInfo[] }).pages = [...pages];
    ctx.notify();
    await settle();

    expect(service.viewports).toHaveBeenCalledTimes(2);
    expect(measurement.getPageScale(inserted).ready).toBe(true);
  });
});
