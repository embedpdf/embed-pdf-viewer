import type { DocumentEvent } from './DocumentEvent';

/**
 * The subscription surface on `DocumentHandle.events`. Intentionally
 * minimal — no filtering, no replay-from-id: plugins build their own
 * filter wrappers (per-page, per-type, …). One subscription, one stream.
 *
 * Delivery is synchronous fan-out with error isolation: a throwing
 * listener never blocks other listeners, and never fails the mutation
 * whose confirmation produced the event.
 */
export interface DocumentEventStream {
  /** Subscribe to every event for this document. Returns the unsubscriber. */
  subscribe(listener: (event: DocumentEvent) => void): () => void;
  /**
   * Highest `origin.serverId` observed so far — the reconnect/backfill
   * cursor for the remote channel. `null` until a remote-identified event
   * has been seen (always `null` on purely-local engines).
   */
  lastServerId(): number | null;
}
