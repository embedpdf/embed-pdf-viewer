/** The capability's four event sources, disposed with the instance. */
import type {
  CalibrationCompletedEvent,
  CalibrationDismissedEvent,
  CalibrationRequestedEvent,
  MeasurementScaleChangedEvent,
} from '../contract';
import type { MeasurementContext } from './context';

export function createEvents(ctx: MeasurementContext) {
  return {
    scaleChanged: ctx.events.source<MeasurementScaleChangedEvent>(),
    calibrationRequested: ctx.events.source<CalibrationRequestedEvent>(),
    calibrationCompleted: ctx.events.source<CalibrationCompletedEvent>(),
    calibrationDismissed: ctx.events.source<CalibrationDismissedEvent>(),
  };
}
export type MeasurementEvents = ReturnType<typeof createEvents>;
