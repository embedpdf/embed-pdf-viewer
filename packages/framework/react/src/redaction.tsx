import { annotationKey } from '@embedpdf/core';
import { RedactionToken } from '@embedpdf/plugin-redaction';
import type {
  RedactionApplyResult,
  RedactionCapability,
  RedactionMark,
} from '@embedpdf/plugin-redaction';
import { useCapability, useSelector } from './runtime';

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

export function useRedaction(): RedactionCapability & {
  applying: boolean;
  lastApplyResult: RedactionApplyResult | null;
} {
  const cap = useCapability(RedactionToken);
  const applying = useSelector(RedactionToken, (c) => c.isApplying());
  const lastApplyResult = useSelector(RedactionToken, (c) => c.getLastResult());
  return { ...cap, applying, lastApplyResult };
}

/** The pending marks, reactive against the annotation plane. */
export function usePendingRedactions(): readonly RedactionMark[] {
  return useSelector(RedactionToken, (c) => c.listPending(), pendingEqual);
}

const pendingEqual = (a: readonly RedactionMark[], b: readonly RedactionMark[]): boolean =>
  a.length === b.length &&
  a.every(
    (item, i) =>
      annotationKey(item.ref) === annotationKey(b[i]!.ref) &&
      item.overlayText === b[i]!.overlayText,
  );
