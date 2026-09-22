/** The four change hooks; disposed with the plugin. */
import { createEventHook } from '@embedpdf/core';

import type {
  CalibrationCompletedEvent,
  CalibrationDismissedEvent,
  CalibrationRequestedEvent,
  MeasurementScaleChangedEvent,
} from '../contract';
import type { MeasurementContext } from './context';

export function createEvents(ctx: MeasurementContext) {
  const report = (error: unknown) =>
    globalThis.console?.error('[measurement] listener failed:', error);
  const scaleChanged = createEventHook<MeasurementScaleChangedEvent>(report);
  const calibrationRequested = createEventHook<CalibrationRequestedEvent>(report);
  const calibrationCompleted = createEventHook<CalibrationCompletedEvent>(report);
  const calibrationDismissed = createEventHook<CalibrationDismissedEvent>(report);
  ctx.cleanup(() => {
    for (const hook of [
      scaleChanged,
      calibrationRequested,
      calibrationCompleted,
      calibrationDismissed,
    ])
      hook.dispose();
  });
  return { scaleChanged, calibrationRequested, calibrationCompleted, calibrationDismissed };
}
export type MeasurementEvents = ReturnType<typeof createEvents>;
