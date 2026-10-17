/**
 * The React view of @embedpdf/plugin-redaction: the four hooks every plugin
 * has, plus the pending marks. Marking rides the annotation plane (the
 * composed `redact` tool); these hooks surface the workflow around it.
 *
 *   const redaction = useRedaction();
 *   const { pendingCount, applying } = useRedactionState();
 *   await redaction.applyAll(); // irreversible: confirm first
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/plugin-redaction';
import type { EventHook } from '@embedpdf/core';
import { RedactionToken, redactionState } from '@embedpdf/plugin-redaction';
import type {
  RedactionCapability,
  RedactionMark,
  RedactionMarkFilter,
} from '@embedpdf/plugin-redaction';
import { useCapability, useCapabilityEvent, useDocumentScope, useKernelValue } from './runtime';
import { settingsHook, stateHook } from './state';

/** The redaction capability: marking, the pending marks, and applying them. */
export function useRedaction(): RedactionCapability {
  return useCapability(RedactionToken);
}

/** Subscribe to one redaction event for the mounted lifetime: `useRedactionEvent((redaction) => redaction.onApplied, handler)`. */
export function useRedactionEvent<T>(
  select: (redaction: RedactionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(RedactionToken, select, handler);
}

/**
 * The redaction state: how many marks wait, whether marks are being applied,
 * and the last apply's result (the page's State table, declared once in
 * `redactionState`). Takes a selector, and re-renders only when what it
 * returns changes.
 */
export const useRedactionState = stateHook(redactionState);

/** The redaction settings (`overlay`), with or without a document. Takes a selector. */
export const useRedactionSettings = settingsHook(RedactionToken);

const NO_MARKS: readonly RedactionMark[] = Object.freeze([]);

/**
 * The marks waiting to be applied, in page order, or one page's (its ref or
 * its index). The lists are reference-stable, so a component re-renders only
 * when its marks change. Empty without a document.
 */
export function usePendingRedactions(filter?: RedactionMarkFilter): readonly RedactionMark[] {
  const scoped = useDocumentScope();
  const page = filter?.page;
  return useKernelValue(
    (kernel) =>
      kernel
        .tryCapability(RedactionToken, scoped ?? undefined)
        ?.listPending(page === undefined ? undefined : { page }) ?? NO_MARKS,
  );
}
