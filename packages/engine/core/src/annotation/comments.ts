/**
 * Comment-thread composition — the conversation-plane view over the flat
 * annotation list.
 *
 * Where `buildThreads()` (relationships.ts) is the minimal, unopinionated
 * one-level composer, `buildCommentThreads()` is the opinionated one a
 * comments sidebar wants:
 *
 *   - the WHOLE `/IRT` subtree of a root is walked (cycle-safe), and its
 *     non-state members flatten into one chronological reply list;
 *   - ISO 32000 §12.5.6.3 state annotations (review status) are extracted
 *     into `review` instead of appearing as replies;
 *   - widgets, links, and unsupported blobs (which includes `/Popup`
 *     dictionaries) are excluded entirely;
 *   - `/RT /Group` subordinates anywhere in the subtree fold into
 *     `groupedParts`, never into `replies`.
 *
 * Tolerant-reader rules (foreign files are messy; none of this throws):
 *   - empty-string `state` / `stateModel` count as absent — the engine
 *     DTO is faithful (`''` = present-but-empty), tolerance lives here;
 *   - a state annotation whose target cannot be resolved is DROPPED
 *     (status metadata with no anchor has no meaning);
 *   - an orphaned non-state reply is PROMOTED to a thread root (matching
 *     `buildThreads`), as is the first input-order member of an `/IRT`
 *     cycle — the visited set breaks the loop, nothing is lost or hangs;
 *   - a `/State` with no `/StateModel` infers its model from the known
 *     vocabulary; a custom model with no derivable state is skipped.
 *
 * Ordering: threads appear in the input order of their roots; the
 * composer never sorts by page (display order is a layout concern —
 * callers join `pages.list()`). Replies sort chronologically by
 * `created ?? modified`, entries without a date last, page z-order
 * (`index`) as the final deterministic tiebreak.
 */

import type { AnnotationDTO } from './kinds';
import type { KnownAnnotationState } from './primitives';
import { classifyRelation, refKey } from './relationships';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { PageObjectNumber } from '../identity/PageObjectNumber';

/** One reviewer's status, derived from an ISO §12.5.6.3 state annotation. */
export interface ReviewStatus {
  /** Wire-normalized when known (`'accepted'`, …); verbatim when custom. */
  state: string;
  /** `'review'`, `'marked'`, or a custom model verbatim. */
  stateModel: string;
  /** Reviewer key: `/EMBD_Metadata` userId, else `/T`, else null. */
  by: string | null;
  /** `/M` ?? `/CreationDate` of the state annotation (ISO 8601). */
  at: string | null;
  /** The state annotation itself — for auditing or deletion. */
  ref: AnnotationRef;
}

/**
 * Review state of one thread. The two ISO state models are independent
 * axes: `byReviewer` / `lastChange` cover the review axis (the standard
 * `Review` model plus custom models), while the personal-checkmark
 * `Marked` axis lives solely in `markedBy`.
 */
export interface CommentThreadReview {
  /** Latest review-axis status per reviewer key (unattributed skipped). */
  byReviewer: Record<string, ReviewStatus>;
  /** Latest review-axis change overall — a convenience, NOT a verdict. */
  lastChange: ReviewStatus | null;
  /** Reviewer keys whose latest Marked-model status is `'marked'`. */
  markedBy: string[];
  /**
   * Every state annotation in the thread's subtree (both axes, all
   * reviewers, chronological) — thread MEMBERSHIP, not status history:
   * deleting a whole thread must delete its state annotations too, and
   * the classified summaries above deliberately drop superseded refs.
   */
  statusRefs: AnnotationRef[];
  /** `byReviewer[currentUserId]`; only set when the option was given. */
  mine?: ReviewStatus | null;
}

export interface CommentThread<T extends AnnotationDTO = AnnotationDTO> {
  root: T;
  pageObjectNumber: PageObjectNumber;
  /** Whole-subtree replies, flattened chronologically; states excluded. */
  replies: T[];
  /** Every `/RT /Group` subordinate found in the subtree. */
  groupedParts: T[];
  review: CommentThreadReview;
}

export interface BuildCommentThreadsOptions {
  /** Compute `review.mine` against this reviewer key. */
  currentUserId?: string;
}

/** Subtypes that never participate in comment threads. `unsupported`
 *  covers `/Popup` dictionaries (raw code 16) and unreadable foreign
 *  blobs — neither makes a meaningful comment card. */
const EXCLUDED_SUBTYPES: ReadonlySet<string> = new Set(['widget', 'link', 'unsupported']);

const REVIEW_STATES: ReadonlySet<KnownAnnotationState> = new Set([
  'accepted',
  'rejected',
  'cancelled',
  'completed',
  'none',
]);
const MARKED_STATES: ReadonlySet<KnownAnnotationState> = new Set(['marked', 'unmarked']);

const nonEmpty = (v: string | null | undefined): v is string => typeof v === 'string' && v !== '';

/**
 * An ISO 32000 §12.5.6.3 state annotation: a text annotation carrying a
 * non-empty `/State` or `/StateModel`. Classification never relies on
 * flags — producers disagree on how state annotations are flagged.
 */
export function isStateAnnotation(a: AnnotationDTO): boolean {
  return a.subtype === 'text' && (nonEmpty(a.state) || nonEmpty(a.stateModel));
}

export function buildCommentThreads(
  annotations: readonly AnnotationDTO[],
  opts: BuildCommentThreadsOptions = {},
): CommentThread[] {
  const eligible = annotations.filter((a) => !EXCLUDED_SUBTYPES.has(a.subtype));

  // Index by ref key, with an /NM alias so a child that addresses its
  // parent by name still resolves when the parent's own ref is
  // objectNumber-form (same dual index as buildThreads). ObjectNumber
  // entries win over nm aliases on duplicate /NM.
  const byKey = new Map<string, AnnotationDTO>();
  for (const a of eligible) {
    const key = refKey(a.ref);
    if (!byKey.has(key)) byKey.set(key, a);
    if (a.nm) {
      const aliasKey = refKey({ kind: 'nm', pageObjectNumber: a.pageObjectNumber, nm: a.nm });
      if (!byKey.has(aliasKey)) byKey.set(aliasKey, a);
    }
  }

  // Children adjacency over resolvable /IRT edges.
  const children = new Map<string, AnnotationDTO[]>();
  for (const a of eligible) {
    if (!a.inReplyTo) continue;
    const parent = byKey.get(refKey(a.inReplyTo));
    if (!parent) continue; // orphan — handled in the promotion pass
    const parentKey = refKey(parent.ref);
    const list = children.get(parentKey);
    if (list) list.push(a);
    else children.set(parentKey, [a]);
  }

  const visited = new Set<string>();
  const threads: CommentThread[] = [];

  const walk = (root: AnnotationDTO): void => {
    const replies: AnnotationDTO[] = [];
    const groupedParts: AnnotationDTO[] = [];
    const states: AnnotationDTO[] = [];

    visited.add(refKey(root.ref));
    const stack = [...(children.get(refKey(root.ref)) ?? [])];
    while (stack.length > 0) {
      const a = stack.pop()!;
      const key = refKey(a.ref);
      if (visited.has(key)) continue; // cycle back-edge — skip
      visited.add(key);
      if (isStateAnnotation(a)) states.push(a);
      else if (classifyRelation(a) === 'grouped-subordinate') groupedParts.push(a);
      else replies.push(a);
      stack.push(...(children.get(key) ?? []));
    }

    replies.sort(chronological);
    // Chronological order makes latest-wins deterministic for equal or
    // missing dates (the comparator's z-order tiebreak applies).
    states.sort(chronological);
    threads.push({
      root,
      pageObjectNumber: root.pageObjectNumber,
      replies,
      groupedParts,
      review: computeReview(states, opts),
    });
  };

  // Pass 1: real roots, in input order.
  for (const a of eligible) {
    if (!a.inReplyTo && !isStateAnnotation(a)) walk(a);
  }

  // Pass 2: promotion. Anything not reached from a root — an orphan whose
  // parent is missing, or a member of an /IRT cycle — promotes to its own
  // root in input order. State annotations never promote: a status with no
  // reachable target is dropped.
  for (const a of eligible) {
    if (visited.has(refKey(a.ref))) continue;
    if (isStateAnnotation(a)) continue;
    walk(a);
  }

  return threads;
}

/** `created ?? modified` ascending; undated last; z-order tiebreak. */
function chronological(a: AnnotationDTO, b: AnnotationDTO): number {
  const at = a.created ?? a.modified;
  const bt = b.created ?? b.modified;
  if (at !== null && bt !== null && at !== bt) return at < bt ? -1 : 1;
  if (at !== null && bt === null) return -1;
  if (at === null && bt !== null) return 1;
  return a.index - b.index;
}

function computeReview(
  states: readonly AnnotationDTO[],
  opts: BuildCommentThreadsOptions,
): CommentThreadReview {
  const byReviewer: Record<string, ReviewStatus> = {};
  const markedLatest: Record<string, ReviewStatus> = {};
  let lastChange: ReviewStatus | null = null;

  for (const a of states) {
    const status = toReviewStatus(a);
    if (!status) continue;
    if (status.stateModel === 'marked') {
      if (status.by !== null && isNewer(status, markedLatest[status.by])) {
        markedLatest[status.by] = status;
      }
      continue; // the Marked axis never feeds byReviewer / lastChange
    }
    if (status.by !== null && isNewer(status, byReviewer[status.by])) {
      byReviewer[status.by] = status;
    }
    if (isNewer(status, lastChange)) lastChange = status;
  }

  const markedBy = Object.keys(markedLatest)
    .filter((key) => markedLatest[key]!.state === 'marked')
    .sort();

  const review: CommentThreadReview = {
    byReviewer,
    lastChange,
    markedBy,
    statusRefs: states.map((a) => a.ref),
  };
  if (opts.currentUserId !== undefined) {
    review.mine = byReviewer[opts.currentUserId] ?? null;
  }
  return review;
}

/**
 * Derive a `ReviewStatus` from one state annotation, or null when nothing
 * classifiable can be derived. ISO defaulting happens HERE, not in the
 * engine reader: a known model with an absent state means `none` /
 * `unmarked`; an absent model infers from a known state; a custom model
 * with no state has no derivable status.
 */
function toReviewStatus(a: AnnotationDTO): ReviewStatus | null {
  if (a.subtype !== 'text') return null;
  const rawState = nonEmpty(a.state) ? a.state : null;
  const rawModel = nonEmpty(a.stateModel) ? a.stateModel : null;

  let stateModel = rawModel;
  if (stateModel === null && rawState !== null) {
    if (REVIEW_STATES.has(rawState as KnownAnnotationState)) stateModel = 'review';
    else if (MARKED_STATES.has(rawState as KnownAnnotationState)) stateModel = 'marked';
    else return null; // custom state without a model: unclassifiable
  }
  let state = rawState;
  if (state === null) {
    if (stateModel === 'review') state = 'none';
    else if (stateModel === 'marked') state = 'unmarked';
    else return null; // custom model without a state: no default exists
  }
  if (stateModel === null) return null; // unreachable, kept for narrowing

  return {
    state,
    stateModel,
    by: a.userId ?? (nonEmpty(a.author) ? a.author : null),
    at: a.modified ?? a.created ?? null,
    ref: a.ref,
  };
}

/** `a` newer than (or supersedes) `b`. `at` decides; dated beats undated.
 *  States arrive pre-sorted by `chronological` (date, then z-order), so on
 *  equal or missing dates the later entry wins via `>=` / `true`. */
function isNewer(a: ReviewStatus, b: ReviewStatus | null | undefined): boolean {
  if (!b) return true;
  if (a.at !== null && b.at !== null) return a.at >= b.at;
  if (a.at !== null) return true;
  if (b.at !== null) return false;
  return true; // both undated: input order — later entry wins
}
