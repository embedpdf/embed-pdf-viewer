/**
 * Process-wide event counters surfaced by /metrics collect() closures —
 * the docAffinity decision ("turn it on when measurements justify it")
 * reads exactly these operational counters. Plain mutable numbers,
 * dependency-injected: services stay prometheus-free and the counts
 * exist (cheaply) even when metrics are disabled.
 */
export interface EngineCounters {
  /** Cross-replica layer write races: +1 per LayerFenceConflict rebase
   *  (a remote replica committed inside this op's prepare→commit
   *  window). A high rate at N>1 replicas is the evidence that flips
   *  `docAffinity.enabled`. */
  layerWriteConflicts: number;
  /** Engine document-open dispatches (base opens + layer-session opens).
   *  Under multi-replica traffic without affinity, hot documents re-open
   *  on many replicas — this is the cold-open-work instrument. */
  docOpens: number;
}

export function createEngineCounters(): EngineCounters {
  return { layerWriteConflicts: 0, docOpens: 0 };
}
