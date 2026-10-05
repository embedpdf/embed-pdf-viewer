/**
 * How long work runs before it lets the thread receive messages. PDFium works
 * for `budgetMs` at a time - a slice of a page render or of a page load - and
 * the caller awaits `between()` before it goes on, so the thread can receive
 * messages meanwhile: an abort stops the work at the next slice. The result is
 * that of the work done at once, however it is sliced.
 */
export interface Slices {
  readonly budgetMs: number;
  between(): Promise<void>;
}
