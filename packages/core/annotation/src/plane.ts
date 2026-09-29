/**
 * The paint/conversation plane boundary — one predicate, consumed by every
 * page surface (paint order, hit-testing, marquee, appearance epoch), so a
 * conversation-plane annotation can never leak onto the page through a
 * surface that forgot to filter.
 *
 * Conversation-only annotations live in the model as first-class `ModelAnnotation`s
 * (selection, deletion and persistence all work on them) but they are
 * dialogue, not page visuals:
 *
 *   - `/RT /R` replies — threaded comment content. Their anchor (the
 *     thread root) is the page visual; the reply renders in the comments
 *     UI. (`/RT /Group` subordinates are the opposite: parts of one
 *     composite visual — a caret grouped to a strikeout — and stay on the
 *     paint plane.)
 *   - ISO 32000 §12.5.6.3 state annotations — text annotations carrying
 *     `/State`/`/StateModel`. Review-status metadata about their target,
 *     never a visual of their own (foreign producers usually flag them
 *     hidden, but classification never relies on flags).
 */
import type { ModelAnnotation } from './types';

const nonEmpty = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value !== '';

/** True when this annotation belongs to the conversation plane only —
 *  never painted, hit, marquee-selected, or counted into a page's
 *  appearance epoch. */
export function isConversationOnly(record: Pick<ModelAnnotation, 'annotation'>): boolean {
  const annotation = record.annotation;
  // A reply: `/IRT` that isn't a `/RT /Group` membership.
  if (annotation.reply && annotation.reply.type !== 'group') return true;
  // A state annotation: a text annot with a non-empty /State or /StateModel.
  if (annotation.subtype === 'text') {
    if (nonEmpty(annotation.state) || nonEmpty(annotation.stateModel)) return true;
  }
  return false;
}

/**
 * A link child attached to another annotation — a `/Link` grouped
 * (`/IRT` + `/RT /Group`) under a non-link parent. Pure substrate: it is
 * the parent's `link` property while authoring (derived via `linkOf`) and
 * the navigation plane's anchor while reading — never painted, never hit
 * as itself. Its rect is reconciled from the parent's geometry, so direct
 * manipulation would be overwritten anyway.
 */
export function isAttachedLink(record: Pick<ModelAnnotation, 'annotation'>): boolean {
  return record.annotation.subtype === 'link' && record.annotation.reply?.type === 'group';
}

/**
 * The one page-surface cull: everything that lives in the substrate but is
 * not a page visual of its own — conversation members (replies, review
 * states) and attached link children. Paint order, hit-testing, marquee
 * and the appearance epoch all filter through this, never the parts.
 */
export function isSubstrateOnly(record: Pick<ModelAnnotation, 'annotation'>): boolean {
  return isConversationOnly(record) || isAttachedLink(record);
}
