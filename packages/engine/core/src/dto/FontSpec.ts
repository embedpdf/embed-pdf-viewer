/**
 * Runtime font registration DTOs.
 *
 * Registered fonts are a RUNTIME-global resource (per PDFium thread), not a
 * document-scoped one: a registered font outlives any single open document and
 * is shared by every page render and annotation-authoring call on its thread.
 * The engine surfaces them through {@link FontService} (`engine.fonts`), not on
 * a `DocumentHandle`.
 *
 * The numeric `CFX_FontRegistry::FontId` returned by the native registry is
 * thread-local and volatile (a per-thread `next_font_id++`). It is deliberately
 * NOT exposed here. Callers key fonts by the stable {@link FontKey} they choose
 * at registration, so a worker respawn (or a future worker pool) can replay the
 * same registration order and rebind keys to whatever ids come back.
 */

/**
 * Stable, caller-chosen identity for a registered font. A plain string: you
 * mint it at {@link FontService.register} and then reference it directly
 * everywhere a font is named (e.g. a FreeText `fontFamily`), with no handle to
 * carry around. Registration validates it, so a typo'd key fails loud at use.
 */
export type FontKey = string;

export interface FontSpec {
  /**
   * Caller-chosen stable key, unique within the engine. Reference this same
   * string later (e.g. `fontFamily`, `addFallback`) — required so identity is
   * always explicit and predictable, and re-registering the same key is a
   * cheap no-op rather than a second copy in the WASM heap.
   */
  key: string;
  /**
   * Resource/base font name used in the PDF and for fallback matching. Empty
   * or omitted → inferred from the font file (maps to the C `family_name`
   * argument, where `""` means "infer").
   */
  familyName?: string;
  /**
   * Style weight (100–900) used for fallback matching. Omitted → inferred from
   * the font (maps to the C `weight` argument, where `0` means "infer").
   */
  weight?: number;
  /**
   * Style italic flag used for fallback matching. Omitted → inferred from the
   * font (maps to the C `italic` argument, where `-1` means "infer").
   */
  italic?: boolean;
  /** Font file bytes (TTF/OTF). */
  data: Uint8Array | ArrayBuffer;
}

/** A successfully registered font. Returned by {@link FontService.register}. */
export interface FontHandle {
  readonly key: FontKey;
  /** Resolved base font name (the inferred name when `familyName` was empty). */
  readonly familyName: string;
  /** Resolved style weight (the inferred weight when `0`/omitted was passed). */
  readonly weight: number;
  readonly italic: boolean;
}
