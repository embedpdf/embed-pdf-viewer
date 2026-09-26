/** The ONE serial queue every dispatch, verb and open sequence rides, plus
 *  D11's deterministic aggregate: the JS nodes run in the CURRENT queue
 *  operation (reset at every operation boundary, read by the executor). */
import { createSerialQueue } from '@embedpdf/core';

export function createQueue() {
  const enqueue = createSerialQueue();
  const budget = { scriptNodes: 0 };
  return { enqueue, budget };
}
export type ActionsQueue = ReturnType<typeof createQueue>;
