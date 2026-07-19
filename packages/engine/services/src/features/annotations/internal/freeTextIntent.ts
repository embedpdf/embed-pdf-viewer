import type { FreeTextIntent } from '@embedpdf/engine-core/runtime';

/**
 * Free-text `/IT` intent names (ISO 32000 §12.5.6.6) mapped to the
 * wire-stable `FreeTextIntent` strings. Kept in engine-services so
 * engine-core stays PDFium-free.
 *
 *   FreeText           -> 'free-text'         (plain text box)
 *   FreeTextCallout    -> 'free-text-callout' (with /CL leader line)
 *
 * `FreeTextTypeWriter` (a typewriter variant) round-trips as the plain
 * `'free-text'` intent — we don't author it.
 */
const IT_FREE_TEXT = 'FreeText';
const IT_FREE_TEXT_CALLOUT = 'FreeTextCallout';

export function freeTextIntentToName(intent: FreeTextIntent): string {
  return intent === 'free-text-callout' ? IT_FREE_TEXT_CALLOUT : IT_FREE_TEXT;
}

export function freeTextIntentFromName(name: string | null): FreeTextIntent {
  return name === IT_FREE_TEXT_CALLOUT ? 'free-text-callout' : 'free-text';
}
