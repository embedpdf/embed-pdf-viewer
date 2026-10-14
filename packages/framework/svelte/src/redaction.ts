/**
 * @embedpdf/svelte/redaction — marking content and removing it for good.
 *
 * Marking rides the annotation plugin (the composed `redact` tool draws on its
 * `<AnnotationLayer>`); these readers surface the workflow around it:
 *
 *   const redaction = useRedaction();
 *   const state = useRedactionState(); // state.pendingCount, state.applying
 *   await redaction.applyAll(); // irreversible: confirm first
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-redaction';

export {
  usePendingRedactions,
  useRedaction,
  useRedactionEvent,
  useRedactionSettings,
  useRedactionState,
} from './redaction/readers';
