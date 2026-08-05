import type { AuditDocKey } from '../db/repos/audit_log.repo';

/**
 * Cross-replica mutation signaling — a DOORBELL, never a data channel.
 *
 * The audit log in the shared database is the data plane: every replica
 * reads the same table, with one global monotonic id sequence. The bus only
 * says "this document has new rows" — subscribers (SSE handlers) react by
 * draining `audit_log WHERE id > theirCursor`. That split is what makes the
 * system correct under every failure: a lost doorbell costs latency, never
 * events, because delivery truth lives in the per-connection cursor and the
 * reconnect/backfill query.
 *
 * Listeners take NO payload by design — the only correct reaction to a ring
 * is "drain from my own cursor", so handing them an id would just invite a
 * stale-cursor bug. The id still travels in the wire payload for debugging.
 *
 * Implementations:
 *   - `InProcessRealtimeBus` — single process (SQLite profile, tests).
 *     SQLite deployments are pinned to one replica (single writer), so
 *     in-process delivery is complete by construction.
 *   - `PostgresRealtimeBus` — LISTEN/NOTIFY. REQUIRED whenever more than
 *     one replica runs: a mutation committed on replica B must ring the
 *     doorbell on replica A's SSE connections. Postgres is the rendezvous;
 *     replicas never talk to each other.
 */
export interface RealtimeBus {
  /** Ring the doorbell for a document — call strictly AFTER commit, so a
   *  reacting subscriber is guaranteed to see the row. */
  publishMutation(key: AuditDocKey, lastAuditId: number): Promise<void>;
  /**
   * Subscribe to a document's doorbell. The listener may be invoked
   * spuriously (e.g. after a transport reconnect, as the gap signal) — it
   * must always react by draining from its own cursor. Returns the
   * unsubscriber.
   */
  subscribeMutation(key: AuditDocKey, listener: () => void): () => void;
  /**
   * Revocation channel — GLOBAL, unlike the per-doc mutation channel: a
   * revoked `jti` may hold SSE streams on any document, on any replica.
   * Two consumers: open SSE handlers close their stream when their jti
   * matches, and `RevokedJtisGuard` instances fill their LRU so the
   * REQUEST path stops accepting the token immediately too (instead of
   * after the 60s negative-cache TTL). `expiresAt` (token exp, epoch ms)
   * lets caches self-prune.
   */
  publishRevocation(jti: string, expiresAt: number): Promise<void>;
  subscribeRevocation(listener: (jti: string, expiresAt: number) => void): () => void;
  close(): Promise<void>;
}

export const docChannelKey = (key: AuditDocKey): string => `${key.tenantId}::${key.docId}`;

/** Single-process bus: a Map fan-out. Complete for the SQLite (one-replica)
 *  profile and for tests; multi-replica Postgres deployments must use
 *  `PostgresRealtimeBus` or replicas will not see each other's mutations. */
export class InProcessRealtimeBus implements RealtimeBus {
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly revocationListeners = new Set<(jti: string, expiresAt: number) => void>();

  async publishMutation(key: AuditDocKey): Promise<void> {
    const set = this.listeners.get(docChannelKey(key));
    if (!set) return;
    for (const listener of [...set]) listener();
  }

  subscribeMutation(key: AuditDocKey, listener: () => void): () => void {
    const channel = docChannelKey(key);
    let set = this.listeners.get(channel);
    if (!set) {
      set = new Set();
      this.listeners.set(channel, set);
    }
    set.add(listener);
    return () => {
      set.delete(listener);
      if (set.size === 0) this.listeners.delete(channel);
    };
  }

  async publishRevocation(jti: string, expiresAt: number): Promise<void> {
    for (const listener of [...this.revocationListeners]) listener(jti, expiresAt);
  }

  subscribeRevocation(listener: (jti: string, expiresAt: number) => void): () => void {
    this.revocationListeners.add(listener);
    return () => {
      this.revocationListeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    this.listeners.clear();
    this.revocationListeners.clear();
  }
}
