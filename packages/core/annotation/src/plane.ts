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
export function isConversationOnly(
  annotation: Pick<ModelAnnotation, 'irt' | 'group' | 'subtype' | 'data'>,
): boolean {
  // A reply: `irt` without `group` (a grouped subordinate carries both).
  if (annotation.irt !== undefined && annotation.group === undefined) return true;
  // A state annotation: a text annot with a non-empty /State or /StateModel.
  if (annotation.subtype === 'text' && annotation.data?.subtype === 'text') {
    if (nonEmpty(annotation.data.state) || nonEmpty(annotation.data.stateModel)) return true;
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
export function isAttachedLink(annotation: Pick<ModelAnnotation, 'subtype' | 'group'>): boolean {
  return annotation.subtype === 'link' && annotation.group !== undefined;
}

/**
 * The one page-surface cull: everything that lives in the substrate but is
 * not a page visual of its own — conversation members (replies, review
 * states) and attached link children. Paint order, hit-testing, marquee
 * and the appearance epoch all filter through this, never the parts.
 */
export function isSubstrateOnly(
  annotation: Pick<ModelAnnotation, 'irt' | 'group' | 'subtype' | 'data'>,
): boolean {
  return isConversationOnly(annotation) || isAttachedLink(annotation);
}
