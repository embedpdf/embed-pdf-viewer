import type {
  FontList,
  FontProgramInfo,
  FontResolution,
  FontResolveRequest,
} from '../dto/DocumentFonts';
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
 * A document's fonts: every font that can be named in it, the fonts a write
 * would draw text with, and the programs behind them. See {@link FontList}.
 */
export interface DocumentFontsService {
  /**
   * Every font that can be named in the document: the standard fonts, the
   * engine's and the document's own. The list changes when a write adds a
   * font, or the engine's fonts change; the document event `fonts.changed`
   * says so.
   */
  list(): AbortablePromise<FontList>;
  /**
   * The fonts a write would draw each run in, found the way the write finds
   * them, without writing: what an editor shows while someone types.
   */
  resolve(request: FontResolveRequest): AbortablePromise<FontResolution>;
  /**
   * A program the document's fonts name, by its display hash, with what an
   * editor needs to lay text out with it. Rejects with `NotFound` for a hash
   * the list doesn't name.
   */
  getProgram(displayHash: string): AbortablePromise<FontProgramInfo>;
  /**
   * The display file of a program the document's fonts name. Rejects with
   * `NotFound` for a hash the list doesn't name, and `InvalidArg` for a
   * program whose `canDownload` is false.
   */
  downloadProgram(displayHash: string): AbortablePromise<Uint8Array>;
}

/**
 * The local engine's document fonts: the shared reads, and the settings of
 * this document's session (never written to the file) that shape the text
 * the engine draws from then on.
 */
export interface LocalDocumentFontsService extends DocumentFontsService {
  setEmbeddingPolicy(policy: FontEmbeddingPolicy): AbortablePromise<void>;
  /**
   * Latin typographic features (kerning, ligatures) when shaping rich text.
   * Off by default: Acrobat's appearances show plain advance widths and no
   * ligatures, and parity with what Acrobat draws wins.
   */
  setTypographicFeatures(enabled: boolean): AbortablePromise<void>;
}
