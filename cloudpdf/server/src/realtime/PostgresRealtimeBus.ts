import { Client } from 'pg';
import type { AuditDocKey } from '../db/repos/audit_log.repo';
import { docChannelKey, type RealtimeBus } from './RealtimeBus';

const CHANNEL = 'cloudpdf_audit_v1';
const REVOKE_CHANNEL = 'cloudpdf_revoked_v1';

/**
 * Cross-replica doorbell over Postgres LISTEN/NOTIFY — the rendezvous is the
 * database every replica already shares, so realtime adds ZERO new services
 * to a deployment (the docker-compose / Helm story stays "Postgres + object
 * storage and nothing else").
 *
 * Topology: ONE dedicated `pg.Client` per replica (LISTEN does not work on
 * pooled connections), listening on a single channel. Every replica hears
 * every document's notifications and filters in memory against its own
 * subscriber map — a Map lookup per NOTIFY, fine until many thousands of
 * events per second.
 *
 * Failure model (the part that keeps this CORRECT, not just fast):
 *   - The NOTIFY payload is tiny (~150B; the 8KB limit is irrelevant) and
 *     advisory — subscribers always drain from their own cursor.
 *   - If the LISTEN connection drops, NOTIFYs during the outage are gone
 *     forever. On every successful (re)connect we therefore ring EVERY
 *     locally-subscribed doorbell once — the gap signal — so each SSE
 *     handler runs its catch-up query. Lost doorbell ⇒ extra query, never
 *     a lost event.
 *   - Reconnect uses capped exponential backoff and never throws into the
 *     caller; while disconnected, publishes fall back to a fresh one-shot
 *     connection so OTHER replicas still hear local commits.
 */
export class PostgresRealtimeBus implements RealtimeBus {
  private readonly listeners = new Map<string, Set<() => void>>();
  private readonly revocationListeners = new Set<(jti: string, expiresAt: number) => void>();
  private client: Client | null = null;
  private closed = false;
  private connecting: Promise<void> | null = null;
  private retryDelayMs = 500;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly connectionString: string,
    private readonly onError: (err: unknown) => void = () => {},
  ) {
    void this.ensureConnected();
  }

  async publishMutation(key: AuditDocKey, lastAuditId: number): Promise<void> {
    await this.notify(
      CHANNEL,
      JSON.stringify({ tenantId: key.tenantId, docId: key.docId, lastAuditId }),
    );
  }

  private async notify(channel: string, payload: string): Promise<void> {
    try {
      await this.ensureConnected();
      await this.client!.query('SELECT pg_notify($1, $2)', [channel, payload]);
    } catch (err) {
      this.onError(err);
      // Best effort while the long-lived client is down: a one-shot
      // connection keeps other replicas informed of local publishes.
      try {
        const oneShot = new Client({ connectionString: this.connectionString });
        await oneShot.connect();
        try {
          await oneShot.query('SELECT pg_notify($1, $2)', [channel, payload]);
        } finally {
          await oneShot.end();
        }
      } catch (fallbackErr) {
        // The signal is lost; mutation subscribers converge via their
        // reconnect/backfill paths, revocation via the heartbeat
        // revalidation sweep. Report and move on.
        this.onError(fallbackErr);
      }
    }
  }

  async publishRevocation(jti: string, expiresAt: number): Promise<void> {
    await this.notify(REVOKE_CHANNEL, JSON.stringify({ jti, expiresAt }));
  }

  subscribeRevocation(listener: (jti: string, expiresAt: number) => void): () => void {
    this.revocationListeners.add(listener);
    return () => {
      this.revocationListeners.delete(listener);
    };
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

  async close(): Promise<void> {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.listeners.clear();
    this.revocationListeners.clear();
    const client = this.client;
    this.client = null;
    if (client) await client.end().catch(() => {});
  }

  private ensureConnected(): Promise<void> {
    if (this.closed) return Promise.reject(new Error('PostgresRealtimeBus is closed'));
    if (this.client) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.connecting = this.connect().finally(() => {
      this.connecting = null;
    });
    return this.connecting;
  }

  private async connect(): Promise<void> {
    const client = new Client({ connectionString: this.connectionString });
    client.on('notification', (msg) => {
      if (!msg.payload) return;
      try {
        if (msg.channel === CHANNEL) {
          const parsed = JSON.parse(msg.payload) as { tenantId?: string; docId?: string };
          if (typeof parsed.tenantId !== 'string' || typeof parsed.docId !== 'string') return;
          this.ring(docChannelKey({ tenantId: parsed.tenantId, docId: parsed.docId }));
        } else if (msg.channel === REVOKE_CHANNEL) {
          const parsed = JSON.parse(msg.payload) as { jti?: string; expiresAt?: number };
          if (typeof parsed.jti !== 'string') return;
          for (const listener of [...this.revocationListeners]) {
            listener(parsed.jti, typeof parsed.expiresAt === 'number' ? parsed.expiresAt : 0);
          }
        }
      } catch (err) {
        this.onError(err);
      }
    });
    client.on('error', (err) => {
      this.onError(err);
      this.handleDisconnect();
    });
    client.on('end', () => this.handleDisconnect());

    await client.connect();
    await client.query(`LISTEN ${CHANNEL}`);
    await client.query(`LISTEN ${REVOKE_CHANNEL}`);
    this.client = client;
    this.retryDelayMs = 500;

    // The gap signal: NOTIFYs sent while we were disconnected are gone, so
    // every locally-subscribed doorbell rings once and each handler drains
    // from its own cursor. Spurious on first connect — harmless by contract.
    for (const channel of [...this.listeners.keys()]) this.ring(channel);
  }

  private ring(channel: string): void {
    const set = this.listeners.get(channel);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        listener();
      } catch (err) {
        this.onError(err);
      }
    }
  }

  private handleDisconnect(): void {
    if (this.closed || !this.client) return;
    const dead = this.client;
    this.client = null;
    void dead.end().catch(() => {});
    this.retryTimer = setTimeout(() => {
      void this.ensureConnected().catch((err) => this.onError(err));
    }, this.retryDelayMs);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30_000);
  }
}
