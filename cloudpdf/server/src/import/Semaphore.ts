/**
 * Tiny FIFO semaphore bounding concurrent server-side pulls. Imports
 * hand the ORIGIN the transfer work (unlike presigned uploads), so a
 * tenant queueing thousands of pulls must not monopolize the event
 * loop's I/O or the egress path.
 *
 * Handoff discipline: `release` passes the slot directly to the
 * longest waiter instead of incrementing the counter, so a fresh
 * `acquire` can never barge in front of the queue.
 */
export class Semaphore {
  private available: number;
  private readonly waiters: Array<() => void> = [];

  constructor(limit: number) {
    this.available = Math.max(1, limit);
  }

  async acquire(): Promise<() => void> {
    if (this.available > 0) {
      this.available--;
    } else {
      await new Promise<void>((resolve) => this.waiters.push(resolve));
      // The releaser handed us its slot without touching `available`.
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiters.shift();
      if (next) next();
      else this.available++;
    };
  }
}
