import {
  AbortablePromise,
  objectNumbersIn,
  type EditSessionAccess,
  type EditSessionStatus,
  type ObjectNumberPool,
  type ObjectNumberRange,
  type ObjectNumbersLost,
} from '@embedpdf/engine-core/runtime';

/** Below this many held numbers, a write asks for a top-up… */
const LOW_WATER = 8;
/** …of up to this many, the most the server tops up by. */
const TOP_UP = 32;
/** The most one bulk reservation asks for. */
const MAX_RESERVATION = 1_000;
/** An editing session's lifetime (ms) until the server states one: the protocol's 15 minutes. */
const DEFAULT_LIFETIME_MS = 15 * 60_000;

export interface CloudObjectNumberPoolOptions {
  /** `POST …/object-numbers`: `count` more numbers for this editing session. */
  reserve(
    count: number,
    signal: AbortSignal,
  ): Promise<{ objectNumbers: ObjectNumberRange[]; expiresIn: number }>;
  now?: () => number;
}

/** What became of the numbers a write named. */
export type WriteOutcome =
  /** It committed: they are spent. */
  | 'committed'
  /** The server refused them (`ObjectNumberUnavailable`): the caller knows. */
  | 'refused'
  /** It failed otherwise: the caller still holds them, for a retry. */
  | 'failed';

/**
 * The cloud engine's object numbers: what the server handed this editing
 * session (the engine's `X-Engine-Session-Id` with the token's subject).
 *
 * Numbers arrive with `/access`, with a write's response (the top-up a
 * write asks for when fewer than 8 are held), with the event stream's
 * `session` events, and from `reserve`'s bulk reservation. A number
 * `take` hands out is the caller's until a write naming it commits.
 *
 * The session lives while the event stream is connected or something
 * keeps it alive; without that it expires, and its numbers may go to
 * another session. So once its expiry has passed while the stream is down,
 * the pool hands out nothing until the server says again what it holds.
 * The stream's `session` event lists everything the session holds: any
 * number this pool held or handed out that isn't on it, and that no write
 * in flight names, is lost (`onLost`, `'reclaimed'`). A new version of the
 * document numbers objects anew: everything is lost (`'versioned'`).
 */
export class CloudObjectNumberPool implements ObjectNumberPool {
  private readonly now: () => number;
  /** Held and not handed out, lowest first. */
  private available: number[] = [];
  /** Handed out by `take`, not yet spent by a write. */
  private readonly taken = new Set<number>();
  /** Named by a write in flight, and how many writes name each. */
  private readonly writing = new Map<number, number>();
  /** When the session expires unless kept alive (ms since the epoch). */
  private expiresAt = 0;
  /** Half the longest lifetime the server has told: what a write's touch guarantees. */
  private halfLifetimeMs = DEFAULT_LIFETIME_MS / 2;
  private streamConnected = false;
  private readonly listeners = new Set<(lost: ObjectNumbersLost) => void>();
  /** The bulk reservation in flight, which later `reserve` calls wait behind. */
  private reserving: Promise<void> = Promise.resolve();
  /** The newest version a `versioned` call named. */
  private version: string | null = null;

  constructor(private readonly opts: CloudObjectNumberPoolOptions) {
    this.now = opts.now ?? Date.now;
  }

  get held(): number {
    return this.usable() ? this.available.length : 0;
  }

  take(): number | null {
    if (!this.usable()) return null;
    const objectNumber = this.available.shift();
    if (objectNumber === undefined) return null;
    this.taken.add(objectNumber);
    return objectNumber;
  }

  reserve(count: number): AbortablePromise<void> {
    return AbortablePromise.run(async (signal) => {
      const turn = this.reserving.then(async () => {
        while (this.held < count) {
          const wanted = Math.min(count - this.held, MAX_RESERVATION);
          const reserved = await this.opts.reserve(wanted, signal);
          this.receive(reserved.objectNumbers, reserved.expiresIn);
        }
      });
      this.reserving = turn.catch(() => undefined);
      await turn;
    });
  }

  onLost(listener: (lost: ObjectNumbersLost) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** How many numbers a write should ask the server for: 0 while enough are held. */
  topUp(): number {
    const held = this.held;
    return held < LOW_WATER ? TOP_UP - held : 0;
  }

  /** How many numbers `/access` should ask for: enough to make up the first block. */
  wantedAtAccess(): number {
    return Math.max(0, LOW_WATER - this.held);
  }

  // ── what the server says ────────────────────────────────────────────────

  /**
   * `/access` answered for the editing session. A session the server made
   * anew holds nothing of what this pool had.
   */
  opened(edit: EditSessionAccess): void {
    if (edit.session === 'new') this.lose(this.unspent(), 'reclaimed');
    this.receive(edit.objectNumbers, edit.expiresIn);
  }

  /**
   * Numbers handed to the session: by `/access`, a write's top-up or the
   * bulk reservation; `expiresIn` (seconds) when the answer told it. Numbers
   * held from before an expiry the server can't vouch for any more are
   * dropped: only a `session` event says which survived.
   */
  receive(ranges: readonly ObjectNumberRange[], expiresIn?: number): void {
    if (expiresIn !== undefined) {
      if (!this.usable()) this.lose(this.available.splice(0), 'reclaimed');
      this.expiresIn(expiresIn);
    }
    this.add(objectNumbersIn(ranges));
  }

  /**
   * The event stream's `session` event: everything the session holds now.
   * What this pool held or handed out and the list doesn't name, unless a
   * write in flight names it, is lost.
   */
  sync(status: EditSessionStatus): void {
    this.expiresIn(status.expiresIn);
    const held = new Set(objectNumbersIn(status.held));
    const lost = this.unspent().filter((n) => !held.has(n));
    for (const n of lost) this.taken.delete(n);
    this.available = [...held]
      .filter((n) => !this.taken.has(n) && !this.writing.has(n))
      .sort((a, b) => a - b);
    this.emit(lost, 'reclaimed');
  }

  /**
   * Version `sha256` was published: it numbers objects anew, so every number
   * held or handed out is gone. Told once per version (the stream and this
   * engine's own completion both tell it, in either order).
   */
  versioned(sha256: string): void {
    if (sha256 === this.version) return;
    this.version = sha256;
    this.lose(this.unspent(), 'versioned');
  }

  /** The event stream connected or dropped: while it's up, the server keeps the session alive. */
  connected(connected: boolean): void {
    this.streamConnected = connected;
  }

  // ── writes ──────────────────────────────────────────────────────────────

  /** A write that names `numbers` was called. */
  beginWrite(numbers: readonly number[]): void {
    for (const n of numbers) this.writing.set(n, (this.writing.get(n) ?? 0) + 1);
  }

  /**
   * The write that named `numbers` settled. A committed write also kept the
   * session alive: at least half its lifetime is left.
   */
  endWrite(numbers: readonly number[], outcome: WriteOutcome): void {
    for (const n of numbers) {
      const left = (this.writing.get(n) ?? 1) - 1;
      if (left > 0) this.writing.set(n, left);
      else this.writing.delete(n);
      if (outcome !== 'failed') this.taken.delete(n);
    }
    if (outcome === 'committed') {
      this.expiresAt = Math.max(this.expiresAt, this.now() + this.halfLifetimeMs);
    }
  }

  // ── inside ──────────────────────────────────────────────────────────────

  private usable(): boolean {
    return this.streamConnected || this.now() < this.expiresAt;
  }

  private expiresIn(seconds: number): void {
    const ms = seconds * 1000;
    this.expiresAt = this.now() + ms;
    this.halfLifetimeMs = Math.max(this.halfLifetimeMs, ms / 2);
  }

  private add(numbers: readonly number[]): void {
    const known = new Set([...this.available, ...this.taken]);
    const fresh = numbers.filter((n) => !known.has(n) && !this.writing.has(n));
    if (fresh.length === 0) return;
    this.available = [...this.available, ...fresh].sort((a, b) => a - b);
  }

  /** Held or handed out, and named by no write in flight. */
  private unspent(): number[] {
    return [...this.available, ...this.taken].filter((n) => !this.writing.has(n));
  }

  private lose(numbers: readonly number[], reason: ObjectNumbersLost['reason']): void {
    const gone = new Set(numbers);
    this.available = this.available.filter((n) => !gone.has(n));
    for (const n of gone) this.taken.delete(n);
    this.emit([...gone], reason);
  }

  private emit(numbers: readonly number[], reason: ObjectNumbersLost['reason']): void {
    if (numbers.length === 0) return;
    const lost: ObjectNumbersLost = { numbers: [...numbers].sort((a, b) => a - b), reason };
    for (const listener of [...this.listeners]) listener(lost);
  }
}
