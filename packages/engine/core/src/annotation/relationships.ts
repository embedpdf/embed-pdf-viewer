/**
 * Pure, dependency-free composition of the flat annotation list into
 * reply/group threads. No PDFium, no browser, no zod — safe to import from
 * the cloud SDK, the local engine, and any UI plugin.
 *
 * The engine surfaces `/IRT` + `/RT` as flat edges on every DTO
 * ({@link AnnotationBase.inReplyTo} / {@link AnnotationBase.replyType}); it
 * deliberately does NOT nest replies/group members, because each of those
 * is itself a first-class annotation in the page list. This module turns
 * those edges into the shape a comments sidebar wants.
 *
 * See ISO 32000 §12.5.6.2:
 *   - `/RT /R`     -> a comment-thread reply (default when `/RT` is absent)
 *   - `/RT /Group` -> a subordinate part of one logical annotation group
 */

import type { AnnotationBase } from './base';
import type { AnnotationDTO } from './kinds';
import type { AnnotationRef } from '../identity/AnnotationRef';

/**
 * Where a single annotation sits in the reply/group taxonomy.
 *
 *   'top-level'           no `/IRT` — a primary annotation / thread root.
 *   'reply'               `/IRT` + `/RT /R` (or `/RT` absent) — a comment.
 *   'grouped-subordinate' `/IRT` + `/RT /Group` — a visual part of a group.
 */
export type AnnotationRelationKind = 'top-level' | 'reply' | 'grouped-subordinate';

/**
 * Classify one annotation by its relationship edge alone. Mirrors the
 * spec's "practical parser rule": no `/IRT` is top-level; `/RT /Group` is
 * a grouped subordinate; anything else with an `/IRT` is a reply (the
 * engine has already normalized a missing `/RT` to `'reply'`).
 */
export function classifyRelation(
  a: Pick<AnnotationBase, 'inReplyTo' | 'replyType'>,
): AnnotationRelationKind {
  if (!a.inReplyTo) return 'top-level';
  return a.replyType === 'group' ? 'grouped-subordinate' : 'reply';
}

/**
 * One composed thread: a primary annotation plus the annotations that
 * point at it.
 *
 *   - `groupedParts` (`/RT /Group`) are visual/helper parts of one logical
 *     annotation — a sidebar should fold them into the primary, NOT list
 *     them as separate comments. Group-level fields (Contents, T, Subj, …)
 *     come from the primary; the subordinate's copies are ignored.
 *   - `replies` (`/RT /R`) are real comment-thread entries shown threaded
 *     under the primary.
 *
 * A primary may legitimately have BOTH (e.g. a StrikeOut with a Caret
 * group part and a Text reply).
 */
export interface AnnotationThread<T extends AnnotationDTO = AnnotationDTO> {
  primary: T;
  /** `/RT /Group` children — merge into the primary, don't list separately. */
  groupedParts: T[];
  /** `/RT /R` (or default) children — show as threaded comments. */
  replies: T[];
}

/**
 * Stable string key for an {@link AnnotationRef}, used to match a child's
 * `inReplyTo` against a candidate parent's `ref`. Both sides are produced
 * by the engine with the same identity precedence (objectNumber, then nm,
 * then index), so equal keys mean "same annotation".
 */
export function refKey(ref: AnnotationRef): string {
  switch (ref.kind) {
    case 'objectNumber':
      return `obj:${ref.pageObjectNumber}:${ref.annotObjectNumber}`;
    case 'nm':
      return `nm:${ref.pageObjectNumber}:${ref.nm}`;
    case 'index':
      return `idx:${ref.pageObjectNumber}:${ref.index}`;
  }
}

/**
 * Compose a flat annotation list (one page, or a whole document via
 * `listRawAll()` flattened) into {@link AnnotationThread}s in primary
 * order.
 *
 * Rules (ISO 32000 §12.5.6.2 + the spec's UI rule):
 *   - Annotations with no `/IRT` become thread primaries, in input order.
 *   - A `/RT /Group` child is attached to its primary's `groupedParts`.
 *   - A `/RT /R` (or default) child is attached to its primary's `replies`.
 *   - A child whose parent is not in the input set is treated as an
 *     orphan primary (defensive — e.g. a partial/filtered page slice).
 *
 * Limitations (v1, matches the legacy stack): threading is one level deep
 * — a reply-to-a-reply is keyed to its direct parent, so it only appears
 * nested if that direct parent is itself a primary. Callers that want a
 * sidebar of "most annotations, not widgets/popups" should pre-filter the
 * input; this helper is intentionally unopinionated about eligibility.
 */
export function buildThreads(annotations: readonly AnnotationDTO[]): AnnotationThread[] {
  const byKey = new Map<string, AnnotationDTO>();
  for (const a of annotations) {
    byKey.set(refKey(a.ref), a);
    // Index under /NM too, so a child that points at the parent by name
    // still resolves when the parent's own ref is objectNumber-form.
    if (a.nm && a.nm.length > 0) {
      byKey.set(`nm:${a.ref.pageObjectNumber}:${a.nm}`, a);
    }
  }

  const threads: AnnotationThread[] = [];
  const threadByPrimaryKey = new Map<string, AnnotationThread>();

  const primaryThread = (primary: AnnotationDTO): AnnotationThread => {
    const key = refKey(primary.ref);
    let thread = threadByPrimaryKey.get(key);
    if (!thread) {
      thread = { primary, groupedParts: [], replies: [] };
      threadByPrimaryKey.set(key, thread);
      threads.push(thread);
    }
    return thread;
  };

  // Pass 1: every top-level annotation seeds a thread, preserving order.
  for (const a of annotations) {
    if (!a.inReplyTo) primaryThread(a);
  }

  // Pass 2: attach children to their primary; orphans become primaries.
  for (const a of annotations) {
    if (!a.inReplyTo) continue;
    const parent = byKey.get(refKey(a.inReplyTo));
    if (!parent || parent.inReplyTo) {
      // Parent missing from the set, or itself a child (one-level-deep
      // limitation): surface the annotation as its own primary so it is
      // never silently dropped.
      primaryThread(a);
      continue;
    }
    const thread = primaryThread(parent);
    if (a.replyType === 'group') thread.groupedParts.push(a);
    else thread.replies.push(a);
  }

  return threads;
}
