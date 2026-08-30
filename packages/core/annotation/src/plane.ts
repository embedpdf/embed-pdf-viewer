/**
 * The paint/conversation plane boundary — ONE predicate, consumed by every
 * page surface (paint order, hit-testing, marquee, appearance epoch), so a
 * conversation-plane annotation can never leak onto the page through a
 * surface that forgot to filter.
 *
 * Conversation-only annotations live in the model as first-class `Annot`s
 * (selection, deletion and persistence all work on them) but they are
 * DIALOGUE, not page visuals:
 *
 *   - `/RT /R` replies — threaded comment content. Their anchor (the
 *     thread root) is the page visual; the reply renders in the comments
 *     UI. (`/RT /Group` subordinates are the opposite: parts of ONE
 *     composite visual — a caret grouped to a strikeout — and stay on the
 *     paint plane.)
 *   - ISO 32000 §12.5.6.3 state annotations — text annotations carrying
 *     `/State`/`/StateModel`. Review-status metadata about their target,
 *     never a visual of their own (foreign producers usually flag them
 *     hidden, but classification never relies on flags).
 */
import type { Annot } from './types';

const nonEmpty = (v: string | null | undefined): v is string => typeof v === 'string' && v !== '';

/** True when this annotation belongs to the conversation plane only —
 *  never painted, hit, marquee-selected, or counted into a page's
 *  appearance epoch. */
export function isConversationOnly(
  a: Pick<Annot, 'irt' | 'group' | 'subtype' | 'data'>,
): boolean {
  // A reply: `irt` without `group` (a grouped subordinate carries both).
  if (a.irt !== undefined && a.group === undefined) return true;
  // A state annotation: a text annot with a non-empty /State or /StateModel.
  if (a.subtype === 'text' && a.data?.subtype === 'text') {
    if (nonEmpty(a.data.state) || nonEmpty(a.data.stateModel)) return true;
  }
  return false;
}

/**
 * A link CHILD attached to another annotation — a `/Link` grouped
 * (`/IRT` + `/RT /Group`) under a non-link parent. Pure substrate: it is
 * the parent's `link` PROPERTY while authoring (derived via `linkOf`) and
 * the navigation plane's anchor while reading — never painted, never hit
 * as itself. Its rect is RECONCILED from the parent's geometry, so direct
 * manipulation would be overwritten anyway.
 */
export function isAttachedLink(a: Pick<Annot, 'subtype' | 'group'>): boolean {
  return a.subtype === 'link' && a.group !== undefined;
}

/**
 * The ONE page-surface cull: everything that lives in the substrate but is
 * not a page visual of its own — conversation members (replies, review
 * states) and attached link children. Paint order, hit-testing, marquee
 * and the appearance epoch all filter through THIS, never the parts.
 */
export function isSubstrateOnly(
  a: Pick<Annot, 'irt' | 'group' | 'subtype' | 'data'>,
): boolean {
  return isConversationOnly(a) || isAttachedLink(a);
}
