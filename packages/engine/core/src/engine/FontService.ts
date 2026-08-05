import type { FontHandle, FontKey, FontSpec } from '../dto/FontSpec';
import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * Engine-level service for registering runtime fonts and configuring the
 * ordered glyph-fallback chain. Runtime-global, not document-scoped: a
 * registered font is shared by every page render and annotation-authoring
 * call on the engine's PDFium thread, and survives document open/close.
 *
 * Availability is the deliberate local-vs-cloud split:
 *   - `@embedpdf/engine` (local/WASM) implements it: the developer embedding
 *     the viewer decides what fonts ship to the client runtime.
 *   - `@cloudpdf/engine` (cloud) does NOT expose it (`Engine.fonts` is
 *     undefined). Fallback fonts are a server policy decision, loaded once on
 *     the server runtime; clients cannot influence them.
 *
 * `register` and `addFallback` are intentionally separate calls: registering a
 * font makes it available for explicit annotation authoring
 * (`FreeTextDraft.registeredFontKey`); adding it to the fallback chain *also*
 * makes it eligible for automatic missing-glyph substitution during page
 * rendering and appearance generation. Many fonts want one without the other.
 */
export interface FontService {
  /**
   * Register a single font. Idempotent: registering a font whose `key` (or, if
   * `key` is omitted, whose content hash) is already known resolves to the
   * existing handle without re-uploading bytes to the runtime.
   *
   * Rejects with `EngineErrorCode.InvalidArg` when the runtime cannot load the
   * font (corrupt file, unsupported format, no glyphs).
   */
  register(spec: FontSpec): AbortablePromise<FontHandle>;

  /** Register several fonts, preserving order. */
  registerAll(specs: FontSpec[]): AbortablePromise<FontHandle[]>;

  /**
   * Append a registered font to the ordered fallback chain. Order is
   * precedence: the first registered font that covers a missing glyph wins,
   * with style (weight/italic) used as a tie-breaker by the runtime.
   */
  addFallback(font: FontHandle | FontKey): AbortablePromise<void>;

  /** Clear the fallback chain without unregistering the fonts themselves. */
  clearFallbacks(): AbortablePromise<void>;

  /** Unregister every font and reset the fallback chain. */
  clear(): AbortablePromise<void>;

  /** Currently registered fonts, in registration order. */
  list(): readonly FontHandle[];
}
