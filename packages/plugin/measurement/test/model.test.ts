import { describe, expect, it } from 'vitest';
import { measureFromRatio, toPageRef } from '@embedpdf/engine-core/runtime';
import type { PageMeasurementViewport } from '@embedpdf/engine-core/runtime';

import {
  beginScaleChange,
  clearLoadError,
  endScaleChange,
  initialMeasurementState,
  pageScaleOf,
  recordLoadError,
  selectPageScale,
  setCalibration,
  setLocalViewports,
  setReports,
} from '../src/model';

const CROP = { left: 0, bottom: 0, right: 600, top: 800 };
const FALLBACK = measureFromRatio(1, 1, 'm');
const OWNED = measureFromRatio(1, 100, 'm');
const FOREIGN = measureFromRatio(1, 50, 'm');
const ERROR = { code: 'Unknown', message: 'read failed' } as never;

const viewport = (owned: boolean, measure = owned ? OWNED : FOREIGN): PageMeasurementViewport =>
  ({ bbox: CROP, name: owned ? 'EmbedPDF' : 'Other', owned, measure }) as PageMeasurementViewport;

describe('measurement transitions', () => {
  it('counts scale changes in flight and never below zero', () => {
    const idle = initialMeasurementState();
    const busy = beginScaleChange(beginScaleChange(idle));
    expect(busy.pending).toBe(2);
    expect(endScaleChange(endScaleChange(busy)).pending).toBe(0);
    expect(endScaleChange(idle)).toBe(idle);
  });

  it('sets the calibration request and the reports, keeping the state when nothing changes', () => {
    const idle = initialMeasurementState();
    expect(setCalibration(idle, null)).toBe(idle);
    const request = {
      page: toPageRef(1),
      from: { x: 0, y: 0 },
      to: { x: 1, y: 0 },
      userSpaceLength: 1,
    };
    expect(setCalibration(idle, request).calibration).toBe(request);
    expect(setReports(idle, idle.reports)).toBe(idle);
    const reports = [{ page: toPageRef(1), scale: FALLBACK, updated: [], skipped: [], failed: [] }];
    expect(setReports(idle, reports).reports).toBe(reports);
  });

  it('records and clears a page load error', () => {
    const idle = initialMeasurementState();
    const failed = recordLoadError(idle, 3, ERROR);
    expect(failed.loadErrors[3]).toBe(ERROR);
    expect(clearLoadError(failed, 3).loadErrors).toEqual({});
    expect(clearLoadError(idle, 3)).toBe(idle);
  });

  it('keeps session-only viewports per page', () => {
    const local = setLocalViewports(initialMeasurementState(), 3, [viewport(true)]);
    expect(local.localViewports[3]).toEqual([viewport(true)]);
  });
});

describe('page scale projection', () => {
  it('prefers the owned viewport, then the one at the crop center, then the fallback', () => {
    expect(selectPageScale([viewport(false), viewport(true)], CROP, FALLBACK, true)).toEqual({
      measure: OWNED,
      source: 'owned',
      ready: true,
      persistent: true,
    });
    expect(selectPageScale([viewport(false)], CROP, FALLBACK, true).source).toBe('foreign');
    expect(selectPageScale([], CROP, FALLBACK, false)).toEqual({
      measure: FALLBACK,
      source: 'default',
      ready: true,
      persistent: false,
    });
  });

  it('is not ready before the first read and reports a failed read', () => {
    const inputs = {
      viewports: undefined,
      status: 'loading' as const,
      error: undefined,
      crop: CROP,
      fallback: FALLBACK,
      persistent: true,
    };
    expect(pageScaleOf(inputs)).toEqual({
      measure: null,
      source: 'default',
      ready: false,
      persistent: true,
    });
    expect(pageScaleOf({ ...inputs, status: 'error', error: ERROR }).error).toBe(ERROR);
  });

  it('keeps the last viewports in effect after a failed re-read, with its error', () => {
    const scale = pageScaleOf({
      viewports: [viewport(true)],
      status: 'error',
      error: ERROR,
      crop: CROP,
      fallback: FALLBACK,
      persistent: true,
    });
    expect(scale).toMatchObject({ source: 'owned', ready: true, error: ERROR });
  });

  it('shows an error only while the page read has failed', () => {
    const scale = pageScaleOf({
      viewports: [],
      status: 'ready',
      error: ERROR,
      crop: CROP,
      fallback: FALLBACK,
      persistent: true,
    });
    expect(scale.error).toBeUndefined();
  });
});
