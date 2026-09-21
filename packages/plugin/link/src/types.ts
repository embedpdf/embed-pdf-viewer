import {
  createCapabilityToken,
  type ChangeOrigin,
  type EventHook,
  type OperationOptions,
  type PageRef,
} from '@embedpdf/core';
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

/** What activating a target WOULD do — no side effect. */
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

export interface LinkActivatedEvent {
  readonly target: PdfLinkTarget;
  readonly activation: LinkActivation;
  readonly origin: ChangeOrigin;
}
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
  /** Every link in the document; loads pages as needed. */
  listAllLinks(options?: OperationOptions): Promise<readonly Link[]>;
  /** Load a page's links. Resolves at once when the annotation plugin owns them. */
  ensureLoaded(page: PageRef, options?: OperationOptions): Promise<void>;
  isLoaded(page: PageRef): boolean;
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
  /** A page's links arrived. */
  readonly onLoaded: EventHook<LinkLoadedEvent>;
}

export interface LinkHostCapability extends LinkCapability {
  /** Does the active tool navigate links (the layer paints anchors only then)? */
  isNavigationEngaged(): boolean;
}

export interface LinkState {
  pages: Record<number, readonly Link[]>;
}
export type LinkAction =
  | { type: 'setPage'; page: PageRef; items: readonly Link[] }
  | { type: 'dropPage'; page: PageRef };

export const LinkToken = createCapabilityToken<LinkHostCapability>('link', {
  hint: `add linkPlugin() from '@embedpdf/plugin-link' to your plugins list`,
});
