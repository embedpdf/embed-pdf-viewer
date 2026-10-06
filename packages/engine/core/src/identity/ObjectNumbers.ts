import type { AbortablePromise } from '../promise/AbortablePromise';

/**
 * The highest object number a document should reach: Acrobat documents
 * 8,388,607 objects per file, and the interoperable rule keeps every object
 * number at or below it. A write that would pass it is refused with
 * `LayerFull`.
 */
export const OBJECT_NUMBER_CEILING = 8_388_607;

/**
 * The last object number handed out to sessions: issuing stops here, which
 * leaves the numbers above it to the objects the engine makes for itself
 * (appearance streams, fonts) until the ceiling.
 */
export const OBJECT_NUMBER_ISSUE_LIMIT = 8_000_000;

/** `count` consecutive object numbers starting at `first`. */
export interface ObjectNumberRange {
  readonly first: number;
  readonly count: number;
}

/** Every number in `ranges`, in order. */
export function objectNumbersIn(ranges: readonly ObjectNumberRange[]): number[] {
  const numbers: number[] = [];
  for (const { first, count } of ranges) {
    for (let i = 0; i < count; i++) numbers.push(first + i);
  }
  return numbers;
}

/** Numbers a session can no longer use, and why. */
export interface ObjectNumbersLost {
  readonly numbers: readonly number[];
  /**
   * `'reclaimed'`: the session expired and its numbers went to another one.
   * `'versioned'`: a new version was published, which numbers objects anew.
   */
  readonly reason: 'reclaimed' | 'versioned';
}

/**
 * This session's reserved object numbers: final names for objects it is
 * about to create. A create that names one of them (`objectNumber`) makes
 * its object at exactly that number, so its ref is known before the engine
 * answers. Numbers are this session's alone; another session never gets
 * them.
 */
export interface ObjectNumberPool {
  /** One held number, removed from the pool; `null` when none is held (then `reserve`). */
  take(): number | null;
  /** How many are held now. */
  readonly held: number;
  /** Resolves once at least `count` are held: one request, only when the pool is short. */
  reserve(count: number): AbortablePromise<void>;
  /**
   * Called with numbers this session took or held that it can no longer
   * use. Creates naming them are refused; a view showing objects at them
   * should drop those. Returns the unsubscriber.
   */
  onLost(listener: (lost: ObjectNumbersLost) => void): () => void;
}
