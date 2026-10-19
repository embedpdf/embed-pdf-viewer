/**
 * How a layer draws an item now, the same rule for annotations and form
 * widgets: the engine's picture of it, or its own drawing (an annotation's
 * scene, a widget's painter).
 *
 * The picture shows while nothing about the item is pending and the picture
 * is of the item's version (its owner's `pictureVersion`). Otherwise the item
 * is drawn live: a value or a restyle shows at once, and a page's refetch
 * never shows an older look. An item with no live drawing (a stamp, a link)
 * keeps the newest picture there is, so nothing is ever blank. Until the
 * page's pictures have loaded once only what's pending is drawn: a picture
 * the engine drew is never swapped in over a live drawing at the first load.
 */
import type { AppearanceUrl } from './object-urls';

export type PictureOrPainting<Painting> =
  | { readonly kind: 'picture'; readonly picture: AppearanceUrl }
  | { readonly kind: 'painting'; readonly painting: Painting }
  | null;

export interface LookState<Painting> {
  /** The owner draws the item live now: a pending change, a widget's look not confirmed yet. */
  readonly pending: boolean;
  /** Its picture, for the state it shows; `null` when there is none. */
  readonly picture: AppearanceUrl | null;
  /** The item's picture version now. */
  readonly version: number;
  /** The page's pictures have loaded at least once. */
  readonly loaded: boolean;
  /** Its live drawing; `null` for an item that has none. */
  readonly paint: () => Painting | null;
}

export function pictureOrPainting<Painting>(
  look: LookState<Painting>,
): PictureOrPainting<Painting> {
  if (!look.pending && !look.loaded) return null;
  if (look.picture && look.picture.version === look.version && !look.pending) {
    return { kind: 'picture', picture: look.picture };
  }
  const painting = look.paint();
  if (painting) return { kind: 'painting', painting };
  return look.picture ? { kind: 'picture', picture: look.picture } : null;
}
