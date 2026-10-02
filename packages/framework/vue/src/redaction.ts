/**
 * @embedpdf/vue/redaction: the Vue view of `@embedpdf/plugin-redaction`. The
 * four composables every plugin has, plus the pending marks. Marking rides
 * the annotation plane (the composed `redact` tool); these composables surface
 * the workflow around it.
 *
 *   const redaction = useRedaction();
 *   const { pendingCount, applying } = useRedactionState();
 *   await redaction.applyAll(); // irreversible: confirm first
 */

// One line per feature: registration travels with the UI.
export * from '@embedpdf/plugin-redaction';
import { toValue } from 'vue';
import type { MaybeRefOrGetter, Ref } from 'vue';
import type { EventHook } from '@embedpdf/core';
import { RedactionToken, redactionState } from '@embedpdf/plugin-redaction';
import type {
  RedactionCapability,
  RedactionMark,
  RedactionMarkFilter,
} from '@embedpdf/plugin-redaction';
import { useCapability, useCapabilityEvent, useOptionalSelector } from './runtime/capabilities';
import { settingsComposable, stateComposable } from './state';
import type { StateComposable } from './state';

/**
 * The redaction API (marking, the pending marks, applying them) of the
 * nearest `<DocumentScope>`'s document, else the active one. The object never
 * changes; outside a document every method throws `not-ready`.
 */
export function useRedaction(): RedactionCapability {
  return useCapability(RedactionToken);
}

/** Subscribe to one redaction event while the component lives: `useRedactionEvent((redaction) => redaction.onApplied, handler)`. */
export function useRedactionEvent<Event>(
  select: (redaction: RedactionCapability) => EventHook<Event>,
  handler: (event: Event) => void,
): void {
  useCapabilityEvent(RedactionToken, select, handler);
}

/**
 * The redaction state as refs: how many marks wait, whether marks are being
 * applied, and the last apply's result (the page's State table, declared once
 * in `redactionState`). With a selector, one ref that updates only when the
 * value it picks changes.
 *
 * Typed through the declaration, so the published types name it from
 * `@embedpdf/plugin-redaction`, a dependency of this package, and not from the
 * engine package `lastResult`'s type comes from, which isn't one.
 */
export const useRedactionState: StateComposable<ReturnType<typeof redactionState.read>> =
  stateComposable(redactionState);

/** The redaction settings (`overlay`), with or without a document, as refs. Takes a selector. */
export const useRedactionSettings = settingsComposable(RedactionToken);

const NO_MARKS: readonly RedactionMark[] = Object.freeze([]);

/**
 * The marks waiting to be applied, in page order, or one page's (its ref or
 * its index; a getter to follow a prop), as a ref. The plugin's lists are
 * reference-stable, so the ref updates only when the marks change. Empty
 * without a document.
 */
export function usePendingRedactions(
  filter?: MaybeRefOrGetter<RedactionMarkFilter | undefined>,
): Readonly<Ref<readonly RedactionMark[]>> {
  return useOptionalSelector(
    RedactionToken,
    (redaction) => redaction.listPending(toValue(filter)),
    NO_MARKS,
  );
}
