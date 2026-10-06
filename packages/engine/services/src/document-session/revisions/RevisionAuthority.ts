import type {
  PageObjectNumber,
  RevisionToken,
  WeakAnnotationState,
} from '@embedpdf/engine-core/runtime';
import {
  EngineError,
  EngineErrorCode,
  UNKNOWN_WEAK_ANNOTATION_STATE,
  revisionTokensEqual,
  toPageRef,
} from '@embedpdf/engine-core/runtime';

export interface RevisionAuthority {
  readonly docSessionId: string;
  token(pageObjectNumber: PageObjectNumber): RevisionToken;
  bump(pageObjectNumber: PageObjectNumber): RevisionToken;
  validate(token: RevisionToken): void;
  weakAnnotationState(pageObjectNumber: PageObjectNumber): WeakAnnotationState;
  recordWeakAnnotationState(pageObjectNumber: PageObjectNumber, state: WeakAnnotationState): void;
  /** Forget a page entirely (generation + weak state). Called when the page
   *  is deleted — its object number is retired, never recycled, so dropping
   *  is hygiene, not correctness. */
  drop(pageObjectNumber: PageObjectNumber): void;
  clear(): void;
  /**
   * Follow the document's transaction: until {@link commit} or {@link abort},
   * the state of every page this authority changes is remembered as it was.
   * At most one is open.
   */
  begin(): void;
  /** Keep what changed since {@link begin}. */
  commit(): void;
  /** Put every page this authority changed since {@link begin} back as it was. */
  abort(): void;
}

/** A page's state as it was before the open transaction first changed it. */
interface PageBefore {
  generation: number | undefined;
  weakAnnotationState: WeakAnnotationState | undefined;
}

/**
 * Per-page generation counter. Backs `RevisionToken` so weak
 * `AnnotationRef.kind === 'index'` references can be validated against the
 * exact page state they were minted from.
 *
 * `bump()` is the only mutator; mutation services call it after a
 * structural change to the page (annotation create/delete/reorder).
 * Read paths never mutate the store.
 */
export class LocalRevisionAuthority implements RevisionAuthority {
  private readonly generations = new Map<PageObjectNumber, number>();
  private readonly weakAnnotationStates = new Map<PageObjectNumber, WeakAnnotationState>();
  /** Pages changed inside the open transaction, as they were; `null` outside one. */
  private before: Map<PageObjectNumber, PageBefore> | null = null;

  constructor(public readonly docSessionId: string) {}

  /** Returns the current generation, defaulting to 0 for first read. */
  current(pageObjectNumber: PageObjectNumber): number {
    return this.generations.get(pageObjectNumber) ?? 0;
  }

  /** Mints a fresh `RevisionToken` for the page's current generation. */
  token(pageObjectNumber: PageObjectNumber): RevisionToken {
    return {
      docSessionId: this.docSessionId,
      page: toPageRef(pageObjectNumber),
      generation: this.current(pageObjectNumber),
    };
  }

  /**
   * Increments the generation counter for a page. Returns the new token.
   * Called by mutation services after every structural change.
   */
  bump(pageObjectNumber: PageObjectNumber): RevisionToken {
    this.remember(pageObjectNumber);
    const next = this.current(pageObjectNumber) + 1;
    this.generations.set(pageObjectNumber, next);
    return this.token(pageObjectNumber);
  }

  /**
   * Strict equality check. Throws `EngineError(InvalidReference)` when the
   * caller's token does not match what the store currently holds.
   */
  validate(token: RevisionToken): void {
    if (token.docSessionId !== this.docSessionId) {
      throw new EngineError(
        EngineErrorCode.InvalidReference,
        'revision token belongs to a different document session',
        { details: { token } },
      );
    }
    const current = this.token(token.page.objectNumber);
    if (!revisionTokensEqual(current, token)) {
      throw new EngineError(EngineErrorCode.InvalidReference, 'revision token is stale', {
        details: { provided: token, current },
      });
    }
  }

  weakAnnotationState(pageObjectNumber: PageObjectNumber): WeakAnnotationState {
    return this.weakAnnotationStates.get(pageObjectNumber) ?? UNKNOWN_WEAK_ANNOTATION_STATE;
  }

  recordWeakAnnotationState(pageObjectNumber: PageObjectNumber, state: WeakAnnotationState): void {
    this.remember(pageObjectNumber);
    this.weakAnnotationStates.set(pageObjectNumber, state);
  }

  drop(pageObjectNumber: PageObjectNumber): void {
    this.remember(pageObjectNumber);
    this.generations.delete(pageObjectNumber);
    this.weakAnnotationStates.delete(pageObjectNumber);
  }

  clear(): void {
    this.generations.clear();
    this.weakAnnotationStates.clear();
    this.before = null;
  }

  begin(): void {
    if (this.before) {
      throw new EngineError(EngineErrorCode.Unknown, 'a revision transaction is already open');
    }
    this.before = new Map();
  }

  commit(): void {
    this.before = null;
  }

  abort(): void {
    if (!this.before) return;
    for (const [pageObjectNumber, page] of this.before) {
      restore(this.generations, pageObjectNumber, page.generation);
      restore(this.weakAnnotationStates, pageObjectNumber, page.weakAnnotationState);
    }
    this.before = null;
  }

  /** Inside a transaction, remember the page as it was before its first change. */
  private remember(pageObjectNumber: PageObjectNumber): void {
    if (!this.before || this.before.has(pageObjectNumber)) return;
    this.before.set(pageObjectNumber, {
      generation: this.generations.get(pageObjectNumber),
      weakAnnotationState: this.weakAnnotationStates.get(pageObjectNumber),
    });
  }
}

/** Put `key` back to `value`, or remove it when it had none. */
function restore<V>(map: Map<PageObjectNumber, V>, key: PageObjectNumber, value: V | undefined) {
  if (value === undefined) map.delete(key);
  else map.set(key, value);
}
