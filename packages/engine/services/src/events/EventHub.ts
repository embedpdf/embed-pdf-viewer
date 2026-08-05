import type {
  DocumentEvent,
  DocumentEventInit,
  DocumentEventStream,
} from '@embedpdf/engine-core/runtime';

/**
 * The in-process implementation of `DocumentEventStream`, shared by both
 * engine shells (one hub per open `DocumentHandle`). The engine that
 * performs a mutation publishes here at confirmation time; the cloud
 * engine's remote channel will also publish here for OTHER sessions'
 * mutations — listeners never learn which transport delivered an event.
 *
 * Delivery contract:
 *   - synchronous fan-out in subscription order;
 *   - error isolation: a throwing listener is re-thrown on a microtask
 *     (so it surfaces to the host's unhandled-error reporting) without
 *     blocking other listeners or failing the mutation path;
 *   - `lastServerId` tracks the highest remote cursor seen, for the
 *     remote channel's reconnect/backfill.
 */
export class EventHub implements DocumentEventStream {
  private readonly listeners = new Set<(event: DocumentEvent) => void>();
  private serverId: number | null = null;

  constructor(
    /** Where a throwing listener's error goes. Defaults to an async
     *  rethrow so it reaches the host's unhandled-error reporting. */
    private readonly onListenerError: (err: unknown) => void = (err) => {
      queueMicrotask(() => {
        throw err;
      });
    },
  ) {}

  subscribe(listener: (event: DocumentEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  publish(event: DocumentEvent): void {
    const { serverId } = event.origin;
    if (serverId !== null) {
      this.serverId = this.serverId === null ? serverId : Math.max(this.serverId, serverId);
    }
    // Snapshot so a listener that (un)subscribes mid-fan-out cannot skew
    // delivery for this event.
    for (const listener of [...this.listeners]) {
      try {
        listener(event);
      } catch (err) {
        this.onListenerError(err);
      }
    }
  }

  lastServerId(): number | null {
    return this.serverId;
  }

  /** Drop every listener (handle close). Idempotent. */
  clear(): void {
    this.listeners.clear();
  }
}

/**
 * Stamps provenance onto events a mutation path produces. One per open
 * handle: the engine shell constructs it with the instance's `sessionId`
 * (and, on cloud, the authenticated `sub` when known) and hands it to the
 * mutation services — they publish results, never build origins.
 */
export class SessionEventPublisher {
  constructor(
    private readonly hub: EventHub,
    private readonly sessionId: string,
    private readonly sub: string | null = null,
  ) {}

  /** Publish a mutation THIS engine instance just confirmed. */
  publishLocal(event: DocumentEventInit): void {
    this.hub.publish({
      ...event,
      origin: {
        kind: 'local',
        sessionId: this.sessionId,
        sub: this.sub,
        ts: Date.now(),
        serverId: null,
      },
    } as DocumentEvent);
  }
}
