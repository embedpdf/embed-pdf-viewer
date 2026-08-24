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
} from '@embedpdf/engine-core/runtime';

export interface RevisionAuthority {
  readonly docSessionId: string;
  token(pageObjectNumber: PageObjectNumber): RevisionToken;
  bump(pageObjectNumber: PageObjectNumber): RevisionToken;
  validate(token: RevisionToken): void;
  weakAnnotationState(pageObjectNumber: PageObjectNumber): WeakAnnotationState;
  recordWeakAnnotationState(pageObjectNumber: PageObjectNumber, state: WeakAnnotationState): void;
  /** Forget a page entirely (generation + weak state). Called when the page
   *  is DELETED — its object number is retired, never recycled, so dropping
   *  is hygiene, not correctness. */
  drop(pageObjectNumber: PageObjectNumber): void;
  clear(): void;
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

  constructor(public readonly docSessionId: string) {}

  /** Returns the current generation, defaulting to 0 for first read. */
  current(pageObjectNumber: PageObjectNumber): number {
    return this.generations.get(pageObjectNumber) ?? 0;
  }

  /** Mints a fresh `RevisionToken` for the page's current generation. */
  token(pageObjectNumber: PageObjectNumber): RevisionToken {
    return {
      docSessionId: this.docSessionId,
      pageObjectNumber,
      generation: this.current(pageObjectNumber),
    };
  }

  /**
   * Increments the generation counter for a page. Returns the new token.
   * Called by mutation services after every structural change.
   */
  bump(pageObjectNumber: PageObjectNumber): RevisionToken {
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
    const current = this.token(token.pageObjectNumber);
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
    this.weakAnnotationStates.set(pageObjectNumber, state);
  }

  drop(pageObjectNumber: PageObjectNumber): void {
    this.generations.delete(pageObjectNumber);
    this.weakAnnotationStates.delete(pageObjectNumber);
  }

  clear(): void {
    this.generations.clear();
    this.weakAnnotationStates.clear();
  }
}
