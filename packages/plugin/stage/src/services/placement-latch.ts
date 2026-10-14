/**
 * The behavioral placement latch: it flips when initial placement starts,
 * while `StageState.placed` is the render-commit latch that flips only after
 * placement finishes. Camera behavior keys on this one; renderers key on
 * `placed`, so partial geometry is never observable.
 */
import type { ScrollBehaviorKind } from '../contract';

export interface PlacementLatch {
  started: boolean;
  /** The last navigation asked for before placement; placement applies it last. */
  pending: (() => void) | null;
}

export const createPlacementLatch = (): PlacementLatch => ({ started: false, pending: null });

/**
 * Run a navigation verb now, or, before the first placement, when it happens.
 * Before placement there is no viewport to move a camera in, and placement
 * would reset it anyway, so the last call waits and lands instantly after the
 * initial view: an app that reveals something as the document opens sees it
 * on the first frame.
 */
export function whenPlaced<Options extends { behavior?: ScrollBehaviorKind }>(
  latch: PlacementLatch,
  options: Options | undefined,
  run: (options: Options | undefined) => void,
): void {
  if (latch.started) {
    run(options);
    return;
  }
  latch.pending = () => run({ ...options, behavior: 'instant' } as Options);
}
