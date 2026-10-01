/** @embedpdf/plugin-link/contract: the public link vocabulary. */
import type { EventHook, OperationOptions, PageRef, ResourceStatus } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type {
  AnnotationRef,
  PageDestination,
  PdfActionTree,
  PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import type { ActionDispatchResult } from '@embedpdf/plugin-actions/contract';
import type { LinkNavItem } from '@embedpdf/plugin-annotation/contract';
import type { StageCapability } from '@embedpdf/plugin-stage/contract';

export { LinkToken } from './token';

/**
 * A clickable link area: page-space `bounds`, its target, and its annotation
 * (when it is one). The target and `/A` tree are as the annotation holds
 * them, their destinations in page space.
 */
export type Link = LinkNavItem;
export type { PageDestination, PdfLinkTarget };

/**
 * What activation did: `revealed` (the view went to a page), `uri` (a website
 * opened), `dispatched` (the actions plugin runs the link's action), or
 * `reported` (a link it won't follow). `destination`, `named` and a `uri`
 * with no framework to open it are handed to the caller to perform.
 */
export type LinkActivation =
  | { outcome: 'revealed' }
  | { outcome: 'destination'; destination: PageDestination }
  | { outcome: 'uri'; uri: string }
  | { outcome: 'named'; name: string }
  | { outcome: 'reported'; target: PdfLinkTarget }
  | { outcome: 'dispatched'; dispatch: Promise<ActionDispatchResult> }
  | { outcome: 'none' };

/**
 * What activating a target would do, with no side effect. A `goto` to a page
 * of this document is its destination, ready for `stage.goToDestination`;
 * one to a page the document doesn't have is reported.
 */
export type LinkResolution =
  | { kind: 'destination'; destination: PageDestination }
  | { kind: 'uri'; uri: string }
  | { kind: 'named'; name: string }
  | { kind: 'reported'; target: PdfLinkTarget };

export interface LinkActivateContext {
  /** The link's `/A` tree when it has one; the actions plugin runs it instead of the target. */
  activate?: PdfActionTree;
  ref?: AnnotationRef;
  page?: PageRef;
  /**
   * The view the link was followed in: a page destination moves this Stage.
   * Defaults to the main view.
   */
  stage?: StageCapability;
}

/** A link target was activated through this capability. */
export interface LinkActivatedEvent {
  readonly target: PdfLinkTarget;
  readonly activation: LinkActivation;
}
/** A page's links were read from the engine. */
export interface LinkLoadedEvent {
  readonly page: PageRef;
}

export interface LinkCapability {
  /**
   * Clickable areas on a page (its ref or its index), page space.
   * Reference-stable per page while unchanged; empty for a page that isn't in
   * the document.
   */
  listLinks(page: PageRef | number): readonly Link[];
  /** One link by its stable id, or null. */
  getLink(page: PageRef | number, linkId: string): Link | null;
  /** The topmost (smallest) link under a page point, or null. */
  getLinkAt(page: PageRef | number, point: Point): Link | null;
  /**
   * Every link in the document; loads pages as needed. Rejects when a page's
   * read fails, and `operation-cancelled` when `signal` fires.
   */
  listAllLinks(options?: OperationOptions): Promise<readonly Link[]>;
  /**
   * Load a page's links. Resolves at once when the annotation plugin owns
   * them; rejects when the read fails, which `getStatus(page)` then reports,
   * `not-found` for a page that isn't in the document, and
   * `operation-cancelled` when `signal` fires.
   */
  ensureLoaded(page: PageRef | number, options?: OperationOptions): Promise<void>;
  /** The page's links were read and are current. Always true with the annotation plugin. */
  isLoaded(page: PageRef | number): boolean;
  /** Load state of a page's links: `idle`, `loading`, `ready`, `error` or `forbidden`. */
  getStatus(page: PageRef | number): ResourceStatus;
  /** What activation would do, with no side effect. */
  resolve(target: PdfLinkTarget): LinkResolution;
  /**
   * Follow a link, or a link's target, as a click does, and return what
   * happened at once (the user's gesture is still on the stack, so a website
   * can open in a new tab). A `goto` moves the Stage, by its `scrollBehavior`
   * setting; a website opens through the framework (an `http`, `https`,
   * `mailto` or `tel` address only); a link with an `/A` tree dispatches
   * through the actions plugin. Fires `onActivated`.
   */
  activate(target: PdfLinkTarget | Link, context?: LinkActivateContext): LinkActivation;
  /**
   * Hit test, then activate. Null when no link is there; throws `not-found`
   * for a page that isn't in the document.
   */
  activateAt(
    page: PageRef | number,
    point: Point,
    context?: LinkActivateContext,
  ): LinkActivation | null;
  /** A human label for tooltips. */
  getLabel(link: Link | PdfLinkTarget): string;
  /** After the built-in handling of any activation. */
  readonly onActivated: EventHook<LinkActivatedEvent>;
  /**
   * A page's links were read, first or again after an annotation change on
   * it. Never fires for a failed read, nor while the annotation plugin owns the links.
   */
  readonly onLoaded: EventHook<LinkLoadedEvent>;
}
