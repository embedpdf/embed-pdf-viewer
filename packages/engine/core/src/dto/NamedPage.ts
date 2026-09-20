import type { PageObjectNumber } from '../identity/PageObjectNumber';

/**
 * What a `/Names /Pages` or `/Names /Templates` registration resolves to.
 *
 *   - `page`: a page in the page tree — the normal case; addressable through
 *     `doc.page(pageObjectNumber)` and present in `PageListSnapshot.pages`.
 *   - `template`: a `/Type /Template` dictionary OUTSIDE the page tree
 *     (ISO 32000-2 §12.7.7): never listed as a page, never renderable,
 *     `doc.page()` does not accept its object number. Reported so consumers
 *     can diagnose hidden templates instead of silently ignoring them.
 *   - `dangling`: the value is null, missing, or not a page/template
 *     dictionary. Engines remove `/Pages` registrations when their page is
 *     deleted, so this is only observable in files authored elsewhere.
 */
export type NamedPageTarget =
  | { kind: 'page'; pageObjectNumber: PageObjectNumber }
  | { kind: 'template'; objectNumber: number }
  | { kind: 'dangling' };

/**
 * One entry of the catalog's named-page trees, in tree (key-sorted) order.
 * Page-identity data like `PageLayout.label`, so it rides
 * `PageListSnapshot` and shares the layout plane's version — a key only
 * means something against the page set that contains its target.
 *
 * `name` is the decoded key text and the identity for `pages.setName` /
 * `pages.removeName`; the engine re-encodes it. The engine never interprets
 * the text — Acrobat's stamp-library convention (`identifier=label`) is a
 * consumer concern.
 */
export interface NamedPageEntry {
  name: string;
  target: NamedPageTarget;
}
