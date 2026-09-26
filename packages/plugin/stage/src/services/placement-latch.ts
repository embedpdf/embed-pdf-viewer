/**
 * The behavioral placement latch: it flips when initial placement starts,
 * while `StageState.placed` is the render-commit latch that flips only after
 * placement finishes. Camera behavior keys on this one; renderers key on
 * `placed`, so partial geometry is never observable.
 */
export interface PlacementLatch {
  started: boolean;
}

export const createPlacementLatch = (): PlacementLatch => ({ started: false });
