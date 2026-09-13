/**
 * The shape a document session takes inside the engine.
 *
 * - `layer` (the default): the bytes become an immutable base with a layer of
 *   edits on top. Reads fall through to the base; a write promotes only the
 *   object it touches. A save appends exactly what changed, `download()` on an
 *   unchanged document returns the loaded bytes verbatim, `downloadLayer()`
 *   exports the edits alone, and a signature keeps its validity across later
 *   edits because the signature dictionary is never rewritten.
 * - `plain`: one in-memory PDFium document, the classic shape. A save rewrites
 *   every loaded object. Kept for comparison and for the rare embedder that
 *   depends on that shape; a document that already carries a signature opens
 *   as `layer` regardless, because a plain save would void it.
 *
 * The handle looks the same either way.
 */
export type SessionKind = 'layer' | 'plain';
