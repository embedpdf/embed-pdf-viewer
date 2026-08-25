/**
 * Tracks live long-lived responses (SSE streams) so shutdown can end
 * them deliberately. A hijacked SSE response is invisible to
 * Fastify's `app.close()`, which waits on open sockets — with 25s
 * heartbeats keeping them alive, a single connected viewer would hold
 * shutdown open until the supervisor SIGKILLs, skipping pool and cache
 * teardown on every deploy. `begin()` flips the readiness signal and
 * walks every registered closer.
 */
export class DrainCoordinator {
  private draining = false;
  private readonly closers = new Set<() => void>();

  get isDraining(): boolean {
    return this.draining;
  }

  /**
   * Register a closer for a live stream; returns its unregister. When
   * the server is already draining the closer runs synchronously — a
   * stream that connects mid-drain is ended immediately instead of
   * outliving the listener.
   */
  register(close: () => void): () => void {
    if (this.draining) {
      close();
      return () => undefined;
    }
    this.closers.add(close);
    return () => this.closers.delete(close);
  }

  /** Flip to draining and end every live stream. Idempotent. */
  begin(): void {
    if (this.draining) return;
    this.draining = true;
    for (const close of [...this.closers]) {
      try {
        close();
      } catch {
        // Stream teardown is best-effort; the socket dies with the
        // process either way.
      }
    }
    this.closers.clear();
  }
}
