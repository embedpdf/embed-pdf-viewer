import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * How much of a registered font's program the appearances authored in this
 * document carry. `default` subsets annotation text (FreeText, redaction
 * labels) and embeds form-field text whole; `subset` and `full` apply to
 * both. A font whose licence forbids subsetting is embedded whole under
 * every policy; programs already in the document are never re-embedded.
 */
export type FontEmbeddingPolicy = 'default' | 'subset' | 'full';

/**
 * Per-document font and text-layout settings: session state of this
 * document handle, never written to the file, applied to appearances
 * generated after the call. Local engine only (`doc.fonts` is undefined on
 * engines that do not lay text out in-process).
 */
export interface DocumentFontSettings {
  setEmbeddingPolicy(policy: FontEmbeddingPolicy): AbortablePromise<void>;
  /**
   * Latin typographic features (kerning, ligatures) when shaping rich text.
   * Off by default: Acrobat's appearances show plain advance widths and no
   * ligatures, and parity with what Acrobat draws wins.
   */
  setTypographicFeatures(enabled: boolean): AbortablePromise<void>;
}
