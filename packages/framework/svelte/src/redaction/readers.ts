/**
 * The redaction plugin's readers: `useRedaction()` (the API), `useRedactionState()`,
 * `useRedactionSettings()`, `useRedactionEvent()`, and `usePendingRedactions()` for a list of the
 * marks waiting to be applied.
 */
import type { EventHook } from '@embedpdf/core';
import { RedactionToken, redactionState } from '@embedpdf/plugin-redaction';
import type {
  RedactionCapability,
  RedactionMark,
  RedactionMarkFilter,
} from '@embedpdf/plugin-redaction';
import {
  shallowArray,
  useCapability,
  useCapabilityEvent,
  useOptionalSelector,
} from '../runtime/readers.svelte';
import { settingsReader, stateReader, type StateReader } from '../runtime/state.svelte';
import { valueOf, type CurrentValue, type MaybeGetter } from '../runtime/values.svelte';

/**
 * The redaction API (marking, the pending marks, applying them) of the nearest
 * `<DocumentScope>`'s document, else the active one. Outside a ready document every method throws
 * `not-ready`.
 */
export function useRedaction(): RedactionCapability {
  return useCapability(RedactionToken);
}

/** Subscribe to one redaction event while the component lives: `useRedactionEvent((redaction) => redaction.onApplied, handler)`. */
export function useRedactionEvent<T>(
  select: (redaction: RedactionCapability) => EventHook<T>,
  handler: (event: T) => void,
): void {
  useCapabilityEvent(RedactionToken, select, handler);
}

/**
 * The redaction state: how many marks wait, whether marks are being applied, and the last apply's
 * result (the page's State table, declared once in `redactionState`), as a reactive object
 * (`state.pendingCount`). With a selector, the value it picks as `{ current }`. Empty without a
 * document.
 *
 * Typed through the declaration, so the published types name it from `@embedpdf/plugin-redaction`, a
 * dependency of this package, and not from the engine package `lastResult`'s type comes from, which
 * isn't one.
 */
export const useRedactionState: StateReader<ReturnType<typeof redactionState.read>> =
  stateReader(redactionState);

/** The redaction settings (`overlay`), with or without a document. */
export const useRedactionSettings = settingsReader(RedactionToken);

const NO_MARKS: readonly RedactionMark[] = Object.freeze([]);

/**
 * The marks waiting to be applied, in page order, or one page's (its ref or its index; a function
 * to follow a prop), as `{ current }`. The plugin's lists keep their identity until the marks
 * change, so a list redraws only then. Empty without a document.
 */
export function usePendingRedactions(
  filter?: MaybeGetter<RedactionMarkFilter | undefined>,
): CurrentValue<readonly RedactionMark[]> {
  return useOptionalSelector(
    RedactionToken,
    (redaction) => redaction.listPending(valueOf(filter)),
    NO_MARKS,
    shallowArray,
  );
}
