import type { FreeTextIntent } from '@embedpdf/engine-core/runtime';

/**
 * Free-text `/IT` intent names (ISO 32000 §12.5.6.6) mapped to the
 * wire-stable `FreeTextIntent` strings. Kept in engine-services so
 * engine-core stays PDFium-free.
 *
 *   FreeText           -> 'free-text'            (plain text box)
 *   FreeTextCallout    -> 'free-text-callout'    (with /CL leader line)
 *   FreeTextTypeWriter -> 'free-text-typewriter' (another app's typewriter)
 */
const NAME_BY_INTENT: Record<FreeTextIntent, string> = {
  'free-text': 'FreeText',
  'free-text-callout': 'FreeTextCallout',
  'free-text-typewriter': 'FreeTextTypeWriter',
};

export function freeTextIntentToName(intent: FreeTextIntent): string {
  return NAME_BY_INTENT[intent];
}

export function freeTextIntentFromName(name: string | null): FreeTextIntent {
  const found = Object.entries(NAME_BY_INTENT).find(([, candidate]) => candidate === name);
  return (found?.[0] as FreeTextIntent | undefined) ?? 'free-text';
}
