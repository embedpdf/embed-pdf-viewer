/**
 * Behavioral latch: flips when initial placement STARTS, while `state.placed`
 * is the render-commit latch that flips only after placement finishes. The
 * distinction keeps placement-time camera behavior unchanged while making
 * partial geometry unobservable to renderers.
 */
export interface PlacementLatch {
  started: boolean;
}

export const createPlacementLatch = (): PlacementLatch => ({ started: false });
