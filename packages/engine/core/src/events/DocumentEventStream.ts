import type { DocumentEvent, DocumentEventOf, DocumentEventType } from './DocumentEvent';

/**
 * The subscription surface on `DocumentHandle.events`: every event with
 * `subscribe`, one type with `on`. No replay-from-id: plugins build their
 * own filter wrappers (per-page, …) on top.
 *
 * Delivery is synchronous fan-out with error isolation: a throwing
 * listener never blocks other listeners, and never fails the mutation
 * whose confirmation produced the event.
 */
export interface DocumentEventStream {
  /** Subscribe to every event for this document. Returns the unsubscriber. */
  subscribe(listener: (event: DocumentEvent) => void): () => void;
  /** Subscribe to one type of event, typed by it. Returns the unsubscriber. */
  on<T extends DocumentEventType>(
    type: T,
    listener: (event: DocumentEventOf<T>) => void,
  ): () => void;
  /**
   * Highest `origin.serverId` observed so far — the reconnect/backfill
   * cursor for the remote channel. `null` until a remote-identified event
   * has been seen (always `null` on purely-local engines).
   */
  lastServerId(): number | null;
}

/**
 * `on(type, listener)` built on a stream's `subscribe`, so both engines
 * filter the same way and a type listener counts as a subscriber (the cloud
 * opens its live stream for the first one).
 */
export function subscribeToType<T extends DocumentEventType>(
  subscribe: DocumentEventStream['subscribe'],
  type: T,
  listener: (event: DocumentEventOf<T>) => void,
): () => void {
  return subscribe((event) => {
    if (event.type === type) listener(event as DocumentEventOf<T>);
  });
}
