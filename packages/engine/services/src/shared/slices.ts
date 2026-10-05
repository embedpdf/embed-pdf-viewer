import { throwIfAborted } from './abort';

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

/**
 * The slices of a loop of short native calls (a page's glyphs, its
 * annotations, a search's pages): the loop asks `due` between items, and
 * `pause()`s once a slice's budget is spent. Checking is cheap; pausing lets
 * the thread receive messages, so an abort stops the loop there.
 */
export class SliceTimer {
  private started = performance.now();

  constructor(
    private readonly slices: Slices,
    private readonly signal: AbortSignal,
  ) {}

  /** True once the current slice has run for its budget. */
  get due(): boolean {
    return performance.now() - this.started >= this.slices.budgetMs;
  }

  /** Lets the thread receive messages, stops on an abort, and starts the next slice. */
  async pause(): Promise<void> {
    await this.slices.between();
    throwIfAborted(this.signal);
    this.started = performance.now();
  }
}
