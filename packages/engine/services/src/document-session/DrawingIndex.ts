/**
 * An open document's stamp drawings, known by content, so stamps with the
 * same artwork place one drawing. It lives in memory for as long as the
 * native document does; nothing of it is written into the PDF, and a reopen
 * rebuilds it from what the drawings are then.
 *
 * Both maps stay true because no writer edits a drawing in place: a stamp
 * that changes gets a new wrapper, and new artwork is a new drawing. Anything
 * that deletes objects or reuses object numbers (a rollback) must call
 * {@link DrawingIndex.forget}.
 */
export class DrawingIndex {
  /**
   * Content id (the SHA-256, in hex, of a drawing's canonical bytes) → the
   * drawing's object number. `null` until the first lookup builds it from
   * the drawings the document's stamps place.
   */
  byContent: Map<string, number> | null = null;

  /**
   * SHA-256 (hex) of bytes as a caller gave them → the drawing made from
   * them, so placing the same bytes again skips making the drawing.
   */
  readonly bySource = new Map<string, number>();

  forget(): void {
    this.byContent = null;
    this.bySource.clear();
  }
}
