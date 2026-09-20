import type { PluginContext } from '@embedpdf/core';
import { AnnotationToken } from '@embedpdf/plugin-annotation/contract';
import { InteractionToken } from '@embedpdf/plugin-interaction/contract';
import {
  measureFromKnownLength,
  measureFromRatio,
  measurementPoint,
  measurementReadout,
  METRES,
  squareOf,
} from '@embedpdf/engine-core/runtime';
import type { PdfMeasure } from '@embedpdf/engine-core/runtime';
import type { MeasurementEffects } from './effects';
import { DEFAULT_PRESETS, withAreaUnit, withPrecision, withUnit } from './scale';
import type {
  MeasurementAction,
  MeasurementCapability,
  MeasurementConfig,
  MeasurementState,
  PageScale,
  SetScaleOptions,
} from './types';

const LOADING: PageScale = { measure: null, source: 'default', ready: false, persistent: false };
const UNITS = Object.keys(METRES) as Array<keyof typeof METRES>;

export function createMeasurementCapability(
  ctx: PluginContext<MeasurementState, MeasurementAction>,
  config: MeasurementConfig,
  effects: MeasurementEffects,
): MeasurementCapability {
  const anno = ctx.get(AnnotationToken);
  const interaction = ctx.get(InteractionToken);
  const canCalibrate = () => ctx.doc?.security.allows('doc.annotate.modify') ?? false;
  const pons = (pon: number | 'all', opts?: SetScaleOptions) =>
    pon === 'all' || opts?.allPages
      ? (ctx.document()?.pages ?? []).map((p) => p.pageObjectNumber)
      : [pon];
  const scaleOf = (pon: number): PdfMeasure => {
    const scale = ctx.getState().pages[pon]?.scale.measure;
    if (!scale || scale.subtype !== 'RL') {
      throw new RangeError('Calibrate this page before changing its units or precision');
    }
    return scale;
  };
  const presets = config.presets ?? DEFAULT_PRESETS;
  return {
    canCalibrate,
    canMeasure: (pon) => anno.canCreate() && !!ctx.getState().pages[pon]?.scale.ready,
    pageScale: (pon) => ctx.getState().pages[pon]?.scale ?? LOADING,
    isBusy: () => ctx.getState().pending > 0,
    lastReports: () => ctx.getState().reports,
    prepare: effects.prepare,
    setPageScale: (pon, measure, opts = {}) => effects.change(pons(pon, opts), () => measure, opts),
    calibrate: (pon, from, to, real, opts = {}) => {
      const a = measurementPoint(from);
      const b = measurementPoint(to);
      const scale = measureFromKnownLength(Math.hypot(b.x - a.x, b.y - a.y), real);
      return effects.change(pons(pon, opts), () => scale, opts);
    },
    setUnit: (pon, unit, areaUnit, opts = {}) =>
      effects.change(pons(pon, opts), (p) => withUnit(scaleOf(p), unit, areaUnit), {
        ...opts,
        allPages: pon === 'all' || opts.allPages,
      }),
    setPrecision: (pon, precision, opts = {}) =>
      effects.change(pons(pon, opts), (p) => withPrecision(scaleOf(p), precision), {
        ...opts,
        allPages: pon === 'all' || opts.allPages,
      }),
    setPreset: (pon, id, opts = {}) => {
      const preset = presets.find((p) => p.id === id);
      if (!preset) {
        return Promise.reject(new RangeError('Unknown scale preset'));
      }
      return effects.change(
        pons(pon, opts),
        (p) =>
          measureFromRatio(
            preset.paper,
            preset.real,
            preset.unit,
            ctx.document()?.pages.find((page) => page.pageObjectNumber === p)?.userUnit ?? 1,
          ),
        opts,
      );
    },
    presets: () => presets,
    units: () => UNITS,
    areaUnits: () => [...UNITS.map(squareOf), 'ha', 'acre'],
    setAreaUnit: (pon, unit, opts = {}) =>
      effects.change(pons(pon, opts), (p) => withAreaUnit(scaleOf(p), unit), opts),
    readout: (ref) => {
      const dto = anno.get(ref);
      return dto ? measurementReadout(dto) : { unavailable: 'not-dimension' };
    },
    startCalibration: () => {
      if (canCalibrate()) {
        ctx.dispatch({ type: 'CALIBRATION', request: null });
        interaction.activateTool('calibrate');
      }
    },
    calibrationRequest: () => ctx.getState().calibration,
    dismissCalibration: () => ctx.dispatch({ type: 'CALIBRATION', request: null }),
    onCalibrationRequested: (cb) => {
      effects.calibrationListeners.add(cb);
      return () => {
        effects.calibrationListeners.delete(cb);
      };
    },
    onScaleChanged: (cb) => {
      effects.scaleListeners.add(cb);
      return () => {
        effects.scaleListeners.delete(cb);
      };
    },
  };
}
