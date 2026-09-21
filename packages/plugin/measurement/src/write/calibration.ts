/** The calibrate flow: arm the tool, turn a captured distance draft into a
 *  request (page space), and dismiss it. */
import type { Point } from '@embedpdf/core-geometry';
import { measurementPoint } from '@embedpdf/engine-core/runtime';

import type { MeasurementCapability } from '../contract';
import type { MeasurementContext, MeasurementServices } from '../services';

export function createCalibration(
  ctx: MeasurementContext,
  { events, store, siblings }: Pick<MeasurementServices, 'events' | 'store' | 'siblings'>,
) {
  const { calibrationRequested, calibrationDismissed } = events;
  const { state, canCalibrate, toPage } = store;
  const { annotation, interaction } = siblings;

  const startCalibration = (): void => {
    if (!canCalibrate()) return;
    ctx.dispatch({ type: 'CALIBRATION', request: null });
    interaction.activateTool('calibrate');
  };
  const dismissCalibration = (): void => {
    if (!state().calibration) return;
    ctx.dispatch({ type: 'CALIBRATION', request: null });
    calibrationDismissed.emit({});
  };

  /** A distance draft from the calibrate tool becomes the pending request. */
  const connect = (): void => {
    const doc = ctx.doc;
    if (!doc) return;
    ctx.cleanup(
      annotation.onDraftCaptured((draft) => {
        if (draft.tool !== 'calibrate' || !doc.security.allows('doc.annotate.modify')) return;
        const a = measurementPoint(draft.from);
        const b = measurementPoint(draft.to);
        const userSpaceLength = Math.hypot(b.x - a.x, b.y - a.y);
        if (!(userSpaceLength > 0)) return;
        let from: Point;
        let to: Point;
        try {
          from = toPage(draft.page, a);
          to = toPage(draft.page, b);
        } catch {
          return; // the page left the registry mid-drag
        }
        const request = { page: draft.page, from, to, userSpaceLength };
        interaction.activateTool('pointer');
        ctx.dispatch({ type: 'CALIBRATION', request });
        calibrationRequested.emit({ request });
      }),
    );
  };

  return {
    connect,
    api: { startCalibration, dismissCalibration } satisfies Partial<MeasurementCapability>,
  };
}
