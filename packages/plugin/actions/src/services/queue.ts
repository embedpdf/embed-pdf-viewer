/**
 * The one serial queue every dispatch, verb and open sequence rides, plus the
 * per-operation script budget: the JavaScript nodes run in the current queue
 * operation, reset at every operation boundary and read by the executor, so a
 * /Next chain shares one deterministic cap.
 */
import type { ActionsContext } from './context';

export function createQueue(ctx: ActionsContext) {
  const enqueue = ctx.serialQueue('actions');
  const budget = { scriptNodes: 0 };
  return { enqueue, budget };
}
export type ActionsQueue = ReturnType<typeof createQueue>;
