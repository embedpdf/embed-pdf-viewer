/** @embedpdf/plugin-link/contract: the public link vocabulary. */
import type { EventHook, OperationOptions, PageRef, ResourceStatus } from '@embedpdf/core';
import type { Point } from '@embedpdf/core-geometry';
import type {
  AnnotationRef,
  PdfActionTree,
  PdfDestination,
  PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import type { ActionDispatchResult } from '@embedpdf/plugin-actions/contract';
import type { LinkNavItem } from '@embedpdf/plugin-annotation/contract';
import type { RevealOptions } from '@embedpdf/plugin-stage/contract';

export { LinkToken } from './token';

/** A clickable link area: page-space `bounds`, its target, and its annotation (when it is one). */
export type Link = LinkNavItem;
export type { PdfDestination, PdfLinkTarget };

/** What activation did, or hands to the host to do (a `uri`/`named` outcome is the host's). */
export type LinkActivation =
  | { outcome: 'revealed' }
  | { outcome: 'destination'; destination: PdfDestination }
  | { outcome: 'uri'; uri: string }
  | { outcome: 'named'; name: string }
  | { outcome: 'reported'; target: PdfLinkTarget }
  | { outcome: 'dispatched'; dispatch: Promise<ActionDispatchResult> }
  | { outcome: 'none' };

/** What activating a target would do, with no side effect. */
export type LinkResolution =
  | { kind: 'reveal'; page: PageRef; pageIndex: number; options: RevealOptions }
  | { kind: 'destination'; destination: PdfDestination }
  | { kind: 'uri'; uri: string }
  | { kind: 'named'; name: string }
  | { kind: 'reported'; target: PdfLinkTarget };

export interface LinkActivateContext {
  /** The link's `/A` tree when it has one; the actions plugin runs it instead of the target. */
  activate?: PdfActionTree;
  ref?: AnnotationRef;
  page?: PageRef;
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
  /** Clickable areas on a page, page space. Reference-stable per page while unchanged. */
  listLinks(page: PageRef): readonly Link[];
  /** One link by its stable id. */
  getLink(page: PageRef, linkId: string): Link | null;
  /** The topmost (smallest) link under a page point. */
  getLinkAt(page: PageRef, point: Point): Link | null;
  /** Every link in the document; loads pages as needed. Rejects when a page's read fails. */
  listAllLinks(options?: OperationOptions): Promise<readonly Link[]>;
  /**
   * Load a page's links. Resolves at once when the annotation plugin owns
   * them; rejects when the read fails, which `getStatus(page)` then reports.
   */
  ensureLoaded(page: PageRef, options?: OperationOptions): Promise<void>;
  /** The page's links were read and are current. Always true with the annotation plugin. */
  isLoaded(page: PageRef): boolean;
  /** Load state of a page's links: `idle`, `loading`, `ready`, `error` or `forbidden`. */
  getStatus(page: PageRef): ResourceStatus;
  /** What activation would do, with no side effect. */
  resolve(target: PdfLinkTarget): LinkResolution;
  /**
   * Perform the activation. A `goto` reveals through the stage; `uri` and
   * `named` are reported for the host to perform synchronously (a user
   * gesture is preserved); a link with an `/A` tree dispatches through the
   * actions plugin.
   */
  activate(target: PdfLinkTarget | Link, context?: LinkActivateContext): LinkActivation;
  /** Hit test, then activate. Null when nothing is there. */
  activateAt(page: PageRef, point: Point, context?: LinkActivateContext): LinkActivation | null;
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
