import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { Kysely } from 'kysely';
import type { Database as Schema } from '../db/schema';
import { AuditLogRepo } from '../db/repos/audit_log.repo';
import { toJsonlEvent } from '../services/EventLogService';
import type { DocumentService } from '../services/DocumentService';
import type { RealtimeBus } from '../realtime/RealtimeBus';
import { requireLayerCapability, requireLayerDocAccessOnly } from '../app/jwt-plugin';
import type { RevocationCheck } from '../auth/JwtVerifier';

/** Per-drain page size; rings coalesce, so a burst streams in pages. */
const DRAIN_LIMIT = 200;
/** Backfill cap: a client further behind than this gets `full-refresh`. */
const MAX_BACKFILL = 1000;
/** Keeps proxies from idling the stream out; also paces exp re-checks. */
const HEARTBEAT_MS = 25_000;
/** setTimeout caps at 2^31-1 ms (~24.8 days) and fires IMMEDIATELY beyond
 *  it — a 90-day token must re-arm in slices, never one long timer. */
const MAX_TIMER_MS = 6 * 60 * 60 * 1000;
/** Cut the stream this long before token expiry so the client can refresh
 *  and reconnect BEFORE its JWT goes stale. */
const EXP_GRACE_MS = 5_000;

export interface EventsRoutesOptions {
  db: Kysely<Schema>;
  documentService: DocumentService;
  realtimeBus: RealtimeBus;
  /** The jti denylist (present when `enableRevocation` is on). Heartbeats
   *  revalidate against it — the belt-and-braces for a replica whose
   *  revocation-push subscription is down. */
  revocation?: RevocationCheck;
}

/**
 * GET /v1/docs/:docId/layers/:layerName/events — the remote half of the
 * document event stream, as Server-Sent Events.
 *
 * The contract mirrors the bus design: this handler never pushes data it
 * was handed — every byte it streams is read from the audit log past the
 * connection's own cursor. Doorbell rings (local or cross-replica) and
 * reconnects both reduce to the same operation: drain `id > cursor`.
 *
 *   - `Last-Event-ID` resumes exactly; absent means "from now" (the client
 *     just fetched a manifest whose `auditHead` it passes here, so the
 *     handshake is gapless).
 *   - A client more than MAX_BACKFILL rows behind gets `full-refresh` and
 *     a cursor at head — refetch state, then stream forward.
 *   - `auth-expiring` is sent shortly before JWT expiry; the client
 *     refreshes its token and reconnects with its cursor.
 *   - `auth-revoked` closes the stream the moment the connection's `jti`
 *     is revoked (pushed via the bus's revocation channel, any replica),
 *     with a heartbeat revalidation sweep as the fallback for a broken
 *     push subscription. The client treats it as terminal — a revoked
 *     credential must not keep WATCHING a document either.
 */
export async function registerEventsRoutes(
  app: FastifyInstance,
  opts: EventsRoutesOptions,
): Promise<void> {
  const repo = new AuditLogRepo(opts.db);

  app.get('/v1/docs/:docId/layers/:layerName/events', async (req, reply) => {
    const { docId, layerName } = req.params as { docId: string; layerName: string };
    const accessCtx = requireLayerDocAccessOnly(req, docId, layerName);
    const pdfBits = await opts.documentService.getEffectivePdfBits(accessCtx, docId, layerName);
    // Events are a read of the document's mutation history — same gate as
    // opening the document at all.
    const ctx = requireLayerCapability(req, docId, layerName, 'doc.open', pdfBits);

    const head = await layerAuditHead(opts.db, ctx.tenantId, docId, layerName);
    const requested = parseLastEventId(req);

    reply.hijack();
    const raw = reply.raw;
    raw.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      'x-accel-buffering': 'no',
      connection: 'keep-alive',
    });
    raw.write(':ok\n\n');

    let closed = false;
    let cursor: number;
    if (requested === null) {
      cursor = head; // no cursor → "from now"
    } else if (head - requested > MAX_BACKFILL) {
      // Too far behind to replay row by row: refetch state, stream forward.
      raw.write(`event: full-refresh\nid: ${head}\ndata: {}\n\n`);
      cursor = head;
    } else {
      cursor = requested;
    }

    // One in-flight drain per connection; rings during a drain coalesce
    // into one more pass — rows can never interleave or duplicate.
    let draining = false;
    let ringAgain = false;
    const drain = async (): Promise<void> => {
      if (closed) return;
      if (draining) {
        ringAgain = true;
        return;
      }
      draining = true;
      try {
        do {
          ringAgain = false;
          const rows = await repo.findSince({
            tenantId: ctx.tenantId,
            docId,
            layerName,
            afterId: cursor,
            limit: DRAIN_LIMIT,
          });
          for (const row of rows) {
            if (closed) return;
            raw.write(
              `id: ${row.id}\nevent: mutation\ndata: ${JSON.stringify(toJsonlEvent(row))}\n\n`,
            );
            cursor = row.id;
          }
          if (rows.length === DRAIN_LIMIT) ringAgain = true; // page through bursts
        } while (ringAgain && !closed);
      } catch (err) {
        req.log.error({ err }, 'events drain failed');
      } finally {
        draining = false;
      }
    };

    // Subscribe BEFORE the initial drain: a row committed between the two
    // rings the doorbell and coalesces into the drain — no startup gap.
    const unsubscribe = opts.realtimeBus.subscribeMutation(
      { tenantId: ctx.tenantId, docId },
      () => void drain(),
    );

    const myJti = ctx.jwt.jti;
    const closeRevoked = () => {
      if (closed) return;
      raw.write(`event: auth-revoked\ndata: {"reason":"jti-revoked"}\n\n`);
      cleanup();
      raw.end();
    };
    // Push path: a revocation issued on ANY replica closes this stream in
    // notification latency. Tokens without a jti cannot be individually
    // revoked (consistent with the verifier) — their lifetime is bounded
    // by `exp` like any bearer credential.
    const unsubscribeRevocation = myJti
      ? opts.realtimeBus.subscribeRevocation((revokedJti) => {
          if (revokedJti === myJti) closeRevoked();
        })
      : () => undefined;

    const heartbeat = setInterval(() => {
      if (closed) return;
      raw.write(':ping\n\n');
      // Sweep path: revalidate the jti against the denylist (LRU-backed,
      // cheap). Covers a replica whose push subscription is down — the
      // worst case becomes one heartbeat interval, not token expiry.
      if (myJti && opts.revocation) {
        void opts.revocation
          .isRevoked(myJti)
          .then((revoked) => {
            if (revoked) closeRevoked();
          })
          .catch(() => undefined);
      }
    }, HEARTBEAT_MS);

    // Expiry close, re-armed in slices (see MAX_TIMER_MS).
    let expTimer: ReturnType<typeof setTimeout> | null = null;
    const armExpClose = () => {
      const exp = ctx.jwt.exp;
      if (exp === null) return; // non-expiring token: bounded by idle/network
      const msLeft = exp * 1000 - Date.now() - EXP_GRACE_MS;
      if (msLeft <= 0) {
        raw.write(`event: auth-expiring\ndata: {"reason":"jwt-exp"}\n\n`);
        cleanup();
        raw.end();
        return;
      }
      expTimer = setTimeout(armExpClose, Math.min(msLeft, MAX_TIMER_MS));
    };

    const cleanup = () => {
      if (closed) return;
      closed = true;
      unsubscribe();
      unsubscribeRevocation();
      clearInterval(heartbeat);
      if (expTimer) clearTimeout(expTimer);
    };

    req.raw.on('close', cleanup);
    armExpClose();
    void drain();
  });
}

function parseLastEventId(req: FastifyRequest): number | null {
  const raw = req.headers['last-event-id'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string' || value.length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : null;
}

/** The layer's audit head (`layers.last_audit_id`); 0 for a virtualized
 *  (never-written) layer — nothing in the log belongs to it yet. */
async function layerAuditHead(
  db: Kysely<Schema>,
  tenantId: string,
  docId: string,
  layerName: string,
): Promise<number> {
  const row = await db
    .selectFrom('layers')
    .select('last_audit_id')
    .where('tenant_id', '=', tenantId)
    .where('doc_id', '=', docId)
    .where('name', '=', layerName)
    .executeTakeFirst();
  return row ? Number(row.last_audit_id) : 0;
}
