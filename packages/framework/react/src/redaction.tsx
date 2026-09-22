import { annotationKey } from '@embedpdf/core';
import type { EventHook } from '@embedpdf/core';
import { useMemo } from 'react';
import { RedactionToken } from '@embedpdf/plugin-redaction';
import type {
  RedactionApplyResult,
  RedactionCapability,
  RedactionMark,
  RedactionMarkFilter,
} from '@embedpdf/plugin-redaction';
import { useCapability, useCapabilityEvent, useSelector } from './runtime';

/**
 * Redaction for the surrounding `DocumentScope`: the pending-marks view plus
 * the destructive apply. Marking rides the annotation plane (the composed
 * `redact` tool); `useRedaction` surfaces the workflow around it.
 *
 *   const redaction = useRedaction();
 *   await redaction.markSelection();
 *   await redaction.applyAll();          // irreversible — confirm first
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-redaction';

/** The capability plus the two reactive facts chrome shows (`applying`, `lastResult`). */
export function useRedaction(): RedactionCapability & {
  applying: boolean;
  lastResult: RedactionApplyResult | null;
} {
  const cap = useCapability(RedactionToken);
  const applying = useSelector(RedactionToken, (c) => c.isApplying());
  const lastResult = useSelector(RedactionToken, (c) => c.getLastResult());
  return useMemo(() => ({ ...cap, applying, lastResult }), [cap, applying, lastResult]);
}

/** Subscribe to one redaction event for the mounted lifetime: `useRedactionEvent((c) => c.onApplied, handler)`. */
export function useRedactionEvent<T>(
  select: (cap: RedactionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(RedactionToken, select, handler);
}

/** The pending marks (optionally of one page), reactive against the annotation plane. */
export function usePendingRedactions(filter?: RedactionMarkFilter): readonly RedactionMark[] {
  const pon = filter?.page?.pageObjectNumber;
  const stable = useMemo(() => filter, [pon]);
  return useSelector(RedactionToken, (c) => c.listPending(stable), pendingEqual);
}

const pendingEqual = (a: readonly RedactionMark[], b: readonly RedactionMark[]): boolean =>
  a.length === b.length &&
  a.every(
    (item, i) =>
      annotationKey(item.ref) === annotationKey(b[i]!.ref) &&
      item.overlayText === b[i]!.overlayText,
  );
