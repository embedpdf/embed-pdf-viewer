import { RedactionToken } from '@embedpdf-x/plugin-redaction';
import type {
  RedactionApplyResult,
  RedactionCapability,
  RedactionPendingItem,
} from '@embedpdf-x/plugin-redaction';
import { useCapability, useSelector } from './runtime';

/**
 * Redaction for the surrounding `DocumentScope`: the pending-marks view plus
 * the destructive apply. Marking rides the annotation plane (the composed
 * `redact` tool); `useRedaction` surfaces the workflow around it.
 *
 *   const redaction = useRedaction();
 *   redaction.toggleRedact();
 *   await redaction.applyAll();          // irreversible — confirm first
 */

// One-line-per-feature (ADAPTERS.md): registration travels with the UI.
export * from '@embedpdf-x/plugin-redaction';

export function useRedaction(): RedactionCapability & {
  applying: boolean;
  lastApplyResult: RedactionApplyResult | null;
} {
  const cap = useCapability(RedactionToken);
  const applying = useSelector(RedactionToken, (c) => c.isApplying());
  const lastApplyResult = useSelector(RedactionToken, (c) => c.lastResult());
  return { ...cap, applying, lastApplyResult };
}

/** The pending marks, reactive against the annotation plane. Note the view
 *  covers LOADED pages — call `preparePending()` (e.g. on panel open) to load
 *  the whole document. */
export function usePendingRedactions(): RedactionPendingItem[] {
  return useSelector(RedactionToken, (c) => c.getPending(), pendingEqual);
}

const pendingEqual = (a: RedactionPendingItem[], b: RedactionPendingItem[]): boolean =>
  a.length === b.length &&
  a.every((item, i) => item.id === b[i]!.id && item.overlayText === b[i]!.overlayText);
