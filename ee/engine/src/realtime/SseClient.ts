import { EngineError, EngineErrorCode } from '@embedpdf/engine-core/runtime';

import type { AuditEventRow } from './auditRowToEvent';
import type { HttpClient } from '../transport/HttpClient';

export interface SseClientOptions {
  http: HttpClient;
  path: string;
  /** Resume cursor for the first connect (manifest `auditHead` /
   *  `lastServerId`); `null` subscribes "from now". */
  initialCursor: number | null;
  /** One parsed audit row, in id order. The cursor has already advanced. */
  onRow(row: AuditEventRow): void;
  /** Server says the gap is too large to replay — refetch state. */
  onFullRefresh(): void;
  /** Auth is permanently gone (401/403); the client stopped for good. */
  onAuthLost(): void;
}

/**
 * Fetch-based SSE consumer. Browser-native `EventSource` cannot send an
 * `Authorization` header, so the stream rides the same `HttpClient` as
 * every other request (same token provider, same session header).
 *
 * Resilience model: the cursor is the only state that matters. Every
 * (re)connect sends `Last-Event-ID: cursor`; the server replays the gap
 * from the audit log. So a dropped stream costs latency, never events —
 * the client needs no buffering and no acknowledgements.
 *
 *   - network drop / server close / `auth-expiring` → reconnect with
 *     jittered exponential backoff (500ms → 30s; reset after a stream
 *     that lived ≥30s). `auth-expiring` reconnects pick up a fresh token
 *     from the HttpClient's provider automatically.
 *   - 401/403 → permanent: `onAuthLost`, no retry loop against a dead
 *     credential.
 */
export class SseClient {
  private cursor: number | null;
  private closed = false;
  private abort: AbortController | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelayMs = 500;

  constructor(private readonly opts: SseClientOptions) {
    this.cursor = opts.initialCursor;
  }

  open(): void {
    if (this.closed) return;
    void this.run();
  }

  close(): void {
    this.closed = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.abort?.abort();
  }

  get lastEventId(): number | null {
    return this.cursor;
  }

  private async run(): Promise<void> {
    const startedAt = Date.now();
    this.abort = new AbortController();
    try {
      const res = await this.opts.http.stream(
        this.opts.path,
        this.cursor !== null ? { 'Last-Event-ID': String(this.cursor) } : {},
        this.abort.signal,
      );
      if (res.status === 401 || res.status === 403) {
        this.closed = true;
        this.opts.onAuthLost();
        return;
      }
      if (!res.ok || !res.body) {
        throw new EngineError(EngineErrorCode.Network, `events stream HTTP ${res.status}`);
      }
      await this.consume(res.body);
      // Stream ended (server close / auth-expiring / network): reconnect.
      if (Date.now() - startedAt >= 30_000) this.retryDelayMs = 500;
    } catch {
      // Aborts land here too; `closed` guards the reschedule below.
    }
    if (this.closed) return;
    const jitter = this.retryDelayMs * (0.5 + Math.random() * 0.5);
    this.retryTimer = setTimeout(() => void this.run(), jitter);
    this.retryDelayMs = Math.min(this.retryDelayMs * 2, 30_000);
  }

  private async consume(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    for (;;) {
      const { done, value } = await reader.read();
      if (done || this.closed) return;
      buffer += decoder.decode(value, { stream: true });
      for (;;) {
        const sep = buffer.indexOf('\n\n');
        if (sep < 0) break;
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        this.dispatch(block);
      }
    }
  }

  private dispatch(block: string): void {
    if (block.startsWith(':')) return; // heartbeat / comment
    let id: number | null = null;
    let event = 'message';
    const data: string[] = [];
    for (const line of block.split('\n')) {
      if (line.startsWith('id:')) id = Number(line.slice(3).trim());
      else if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).trim());
    }
    if (id !== null && Number.isFinite(id)) this.cursor = id;
    if (event === 'mutation') {
      try {
        this.opts.onRow(JSON.parse(data.join('\n')) as AuditEventRow);
      } catch {
        // A malformed row advances the cursor and is skipped; the audit log
        // remains the source of truth for anyone who refetches.
      }
    } else if (event === 'full-refresh') {
      this.opts.onFullRefresh();
    } else if (event === 'auth-revoked') {
      // Terminal: the credential is dead by decree, not by clock — never
      // retry against it (a reconnect would just 401; this saves the trip
      // and surfaces the loss immediately).
      this.closed = true;
      this.abort?.abort();
      this.opts.onAuthLost();
    }
    // 'auth-expiring' needs no handling: the server ends the stream right
    // after, and the reconnect path fetches a fresh token.
  }
}
