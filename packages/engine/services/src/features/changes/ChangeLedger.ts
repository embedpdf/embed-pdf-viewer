import type {
  ChangeResult,
  PdfCoordinates,
  SerializedEngineError,
} from '@embedpdf/engine-core/runtime';

import { recordBytes, type ChangeRecord } from './ChangeRecord';
import type { DocumentSession } from '../../document-session/DocumentSession';

/** What one change answered, kept under its `opId`. */
export type ChangeOutcome =
  | {
      readonly kind: 'applied';
      readonly fingerprint: string;
      readonly result: ChangeResult<PdfCoordinates>;
    }
  | {
      readonly kind: 'refused';
      readonly fingerprint: string;
      readonly error: SerializedEngineError;
    };

/** Why a change can't be undone (`UndoUnavailable`'s `details.reason`). */
export type UndoUnavailableReason = 'final-change' | 'expired';

/** The bytes of captures a session keeps for undo; the oldest records go first. */
const CAPTURE_BUDGET = 64 * 1024 * 1024;

/** How many answers a session keeps for retries; the oldest go first. */
const OUTCOME_LIMIT = 4096;

interface Entry {
  readonly outcome: ChangeOutcome;
  /** Its record while it can be undone. */
  record: ChangeRecord | null;
  bytes: number;
  /** Why it can't be undone any more, once it can't. */
  unavailable?: UndoUnavailableReason;
}

/**
 * What a local session keeps of its changes: every answer under its `opId`,
 * refusals included, so a retry gets the same one; and each undoable change's
 * record, until a final change ends undo for everything before it, or the
 * capture budget runs out (the oldest go first, as `expired`).
 *
 * The cloud keeps the same in its database; a cloud worker's session keeps
 * nothing here between requests.
 */
export class ChangeLedger {
  private readonly entries = new Map<string, Entry>();
  private bytes = 0;

  /** The answer kept under `opId`, if any. */
  outcome(opId: string): ChangeOutcome | undefined {
    return this.entries.get(opId)?.outcome;
  }

  /**
   * The record of the change `opId`, or why it can't be undone. Undefined for
   * a change this session has no answer for.
   */
  record(
    opId: string,
  ):
    | { readonly record: ChangeRecord | null }
    | { readonly unavailable: UndoUnavailableReason }
    | undefined {
    const entry = this.entries.get(opId);
    if (!entry) return undefined;
    if (entry.unavailable) return { unavailable: entry.unavailable };
    return { record: entry.record };
  }

  /** Keeps an applied change's answer, and its record when it can be undone. */
  keepApplied(
    opId: string,
    fingerprint: string,
    result: ChangeResult<PdfCoordinates>,
    record: ChangeRecord | null,
  ): void {
    const bytes = record ? recordBytes(record) : 0;
    this.add(opId, { outcome: { kind: 'applied', fingerprint, result }, record, bytes });
    this.bytes += bytes;
    this.trimCaptures();
  }

  /** Keeps a refusal: asking again answers it again. */
  keepRefused(opId: string, fingerprint: string, error: SerializedEngineError): void {
    this.add(opId, { outcome: { kind: 'refused', fingerprint, error }, record: null, bytes: 0 });
  }

  /**
   * A final change (redaction apply, flatten, signing, form repair) ended undo
   * for itself and every change before it: their records go.
   */
  endUndo(): void {
    for (const entry of this.entries.values()) {
      if (entry.outcome.kind === 'applied' && !entry.unavailable) {
        this.drop(entry, 'final-change');
      }
    }
  }

  private add(opId: string, entry: Entry): void {
    this.entries.set(opId, entry);
    // Oldest first: a Map keeps insertion order.
    for (const [key, old] of this.entries) {
      if (this.entries.size <= OUTCOME_LIMIT) break;
      this.drop(old, 'expired');
      this.entries.delete(key);
    }
  }

  private trimCaptures(): void {
    for (const entry of this.entries.values()) {
      if (this.bytes <= CAPTURE_BUDGET) break;
      if (entry.bytes > 0) this.drop(entry, 'expired');
    }
  }

  private drop(entry: Entry, reason: UndoUnavailableReason): void {
    this.bytes -= entry.bytes;
    entry.record = null;
    entry.bytes = 0;
    entry.unavailable = reason;
  }
}

/** Each session's ledger, made on first use and gone with the session. */
const ledgers = new WeakMap<DocumentSession, ChangeLedger>();

/** The ledger of `session`'s changes. */
export function changeLedgerOf(session: DocumentSession): ChangeLedger {
  let ledger = ledgers.get(session);
  if (!ledger) {
    ledger = new ChangeLedger();
    ledgers.set(session, ledger);
  }
  return ledger;
}
