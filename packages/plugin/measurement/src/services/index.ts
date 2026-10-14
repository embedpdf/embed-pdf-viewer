/** The plugin-private services every area is built on, created once per instance. */
import type { MeasurementContext } from './context';
import { createEvents, type MeasurementEvents } from './events';
import { resolveSiblings, type MeasurementSiblings } from './siblings';
import { createStore, type MeasurementStore } from './store';

export type { MeasurementContext } from './context';

export interface MeasurementServices {
  readonly events: MeasurementEvents;
  readonly store: MeasurementStore;
  readonly siblings: MeasurementSiblings;
}

export function createServices(ctx: MeasurementContext): MeasurementServices {
  return { events: createEvents(ctx), store: createStore(ctx), siblings: resolveSiblings(ctx) };
}
