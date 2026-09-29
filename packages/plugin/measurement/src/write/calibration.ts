/** The calibrate flow: arm the tool, turn a captured distance draft into a
 *  request (page space), and dismiss it. */
import { measurementPoint } from '@embedpdf/engine-core/runtime';

import type { MeasurementCapability } from '../contract';
import { setCalibration } from '../model';
import type { MeasurementContext, MeasurementServices } from '../services';

export function createCalibration(
  ctx: MeasurementContext,
  { events, store, siblings }: Pick<MeasurementServices, 'events' | 'store' | 'siblings'>,
) {
  const { calibrationRequested, calibrationDismissed } = events;
  const { canCalibrate } = store;
  const { annotation, interaction } = siblings;

  const startCalibration = (): void => {
    if (!canCalibrate()) return;
    ctx.state.update(setCalibration, null);
    interaction.activateTool('calibrate');
  };
  const dismissCalibration = (): void => {
    if (!ctx.state.get().calibration) return;
    ctx.state.update(setCalibration, null);
    calibrationDismissed.emit({});
  };

  /** A distance draft from the calibrate tool becomes the pending request. */
  const connect = (): void => {
    ctx.listen(annotation.onDraftCaptured, (draft) => {
      if (draft.tool !== 'calibrate' || !canCalibrate()) return;
      const from = measurementPoint(draft.from);
      const to = measurementPoint(draft.to);
      const userSpaceLength = Math.hypot(to.x - from.x, to.y - from.y);
      if (!(userSpaceLength > 0)) return;
      const request = { page: draft.page, from, to, userSpaceLength };
      interaction.activateTool('pointer');
      ctx.state.update(setCalibration, request);
      calibrationRequested.emit({ request });
    });
  };

  return {
    connect,
    api: { startCalibration, dismissCalibration } satisfies Partial<MeasurementCapability>,
  };
}
