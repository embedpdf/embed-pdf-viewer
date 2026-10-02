/**
 * A page link's anchor: which links a page layer shows, where each anchor
 * sits and what it does natively. Links are real `<a>` elements on purpose: a website
 * link gets an `href` (middle-click, copy link, the status-bar preview and
 * keyboard focus come free); every other click follows the link through the
 * link plugin's `activate()`. The plugin's link type is mirrored
 * structurally, so this package stays free of EmbedPDF imports.
 */
import { sanitizeExternalUri } from './external-uri';
import { rectInPixels } from './page-pixels';
import type { PageToPixels, PixelRect } from './page-pixels';

/** A link as the link plugin lists it: the fields the anchor reads. */
export interface LinkAnchorShape {
  readonly target: { readonly kind: string; readonly uri?: string };
  /** The full `/A` tree; a `/Next` after its root chains more actions. */
  readonly activate?: { readonly root: { readonly next: readonly unknown[] } | null } | null;
  /** A link riding an editable annotation (its parent owns its pixels while annotations are edited). */
  readonly attached: boolean;
}

/**
 * The links a page layer shows anchors for. One owner per pixel: while the
 * active tool edits annotations, a link attached to an annotation stands
 * down so its parent can be selected and moved; a document's own links
 * navigate under every tool that enables link navigation.
 */
export function navigableLinksOf<Link extends LinkAnchorShape>(
  links: readonly Link[],
  annotationEditEnabled: boolean,
): readonly Link[] {
  return annotationEditEnabled ? links.filter((link) => !link.attached) : links;
}

/**
 * The anchor's native `href`: only for a website the browser may open and
 * nothing chained after it. Blocked schemes, targets inside the document and
 * action chains activate through the plugin instead: a native navigation
 * would run the first action and silently drop the rest.
 */
export function linkHrefOf(link: LinkAnchorShape): string | null {
  const chained = (link.activate?.root?.next.length ?? 0) > 0;
  if (link.target.kind !== 'uri' || chained || link.target.uri === undefined) return null;
  return sanitizeExternalUri(link.target.uri);
}

/** A link's anchor, ready to draw. */
export interface LinkAnchor<Link> {
  readonly link: Link;
  /** Where the anchor sits, in the page layer's pixels. */
  readonly box: PixelRect;
  /** Its native `href` ({@link linkHrefOf}), or null. */
  readonly href: string | null;
  /** Its `title` and `aria-label`. */
  readonly label: string;
}

/**
 * The anchor for `link` on a page layer: its box from the link's `bounds`,
 * its `href`, and the label `labelOf` (the link plugin's `getLabel`) gives it.
 */
export function linkAnchorOf<
  Link extends LinkAnchorShape & {
    readonly bounds: { x: number; y: number; width: number; height: number };
  },
>(link: Link, page: PageToPixels, labelOf: (link: Link) => string): LinkAnchor<Link> {
  return {
    link,
    box: rectInPixels(link.bounds, page),
    href: linkHrefOf(link),
    label: labelOf(link),
  };
}

/**
 * Whether a click on an anchor with an `href` stays the browser's: a click
 * with a modifier key opens a background tab or a new window. Every other
 * click is prevented and follows the link through the plugin.
 */
export function isModifiedClick(event: {
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}): boolean {
  return event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}
