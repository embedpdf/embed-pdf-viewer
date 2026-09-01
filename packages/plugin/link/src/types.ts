import { createCapabilityToken, type PageObjectNumber } from '@embedpdf/core';
import type {
  AnnotationRef,
  PdfActionTree,
  PdfDestination,
  PdfLinkTarget,
} from '@embedpdf/engine-core/runtime';
import type { ActionDispatchResult } from '@embedpdf/plugin-actions/contract';
import type { LinkNavItem } from '@embedpdf/plugin-annotation/contract';

export type { LinkNavItem };
// The wire target vocabulary, re-exported so app code building link editors
// needs only this package (the annotation-props precedent).
export type { PdfDestination, PdfLinkTarget };

/**
 * What one activation did. `revealed` = the stage moved the camera;
 * `destination` = no stage plugin — the embedder gets the explicit
 * destination to handle; `uri` = opening is the FRAMEWORK layer's job (the
 * plugin is DOM-free); `named` = a viewer verb (NextPage…) reported until
 * stage verbs land; `reported` = read-only/executable-shaped targets
 * (javascript / goto-remote / launch / unsupported) — surfaced, NEVER
 * executed here (javascript belongs to the scripting orchestrator).
 */
export type LinkActivation =
  | { outcome: 'revealed' }
  | { outcome: 'destination'; destination: PdfDestination }
  | { outcome: 'uri'; uri: string }
  | { outcome: 'named'; name: string }
  | { outcome: 'reported'; target: PdfLinkTarget }
  /** The action engine took the activation (full payload tree, mixed /Next
   *  chains included). `dispatch` is the in-flight result; the framework
   *  opener must do NOTHING for this outcome — the actions UI adapter owns
   *  any URI open (the no-double-open rule). */
  | { outcome: 'dispatched'; dispatch: Promise<ActionDispatchResult> }
  | { outcome: 'none' };

/** Optional activation context: the payload-carrying /A tree (and its
 *  annotation identity) from the LinkNavItem, enabling action-engine
 *  delegation. Without it — or without the actions plugin — activation
 *  follows the classic root-projection path. */
export interface LinkActivateContext {
  activate?: PdfActionTree;
  ref?: AnnotationRef;
  pon?: PageObjectNumber;
}

export interface LinkActivateEvent {
  target: PdfLinkTarget;
  activation: LinkActivation;
}

export interface LinkPluginConfig {
  /** Every activation (navigations AND reported targets) — analytics /
   *  custom handling. Called after the built-in handling ran. */
  onActivate?: (event: LinkActivateEvent) => void;
}

/**
 * The navigation plane of link annotations. Data comes from ONE of two
 * sources, picked at init: the annotation plugin's folded model when that
 * plugin is present (zero extra engine reads — it already lists every
 * page), or the plugin's own engine reads in viewer-only deployments.
 */
export interface LinkCapability {
  /** The clickable link areas of a page (content space, y-down). */
  linksOn(pon: PageObjectNumber): LinkNavItem[];
  /** Lazy-load a page's links (no-op when the annotation plugin owns the data). */
  ensurePage(pon: PageObjectNumber): void;
  /** Whether the navigation plane currently owns links: the active tool
   *  enables `link-nav` (pointer/pan/form-fill by default). While false —
   *  the link tool or any authoring tool is active — the annotation plane
   *  owns them and the LinkLayer stands down. */
  engaged(): boolean;
  /** THE one activation entry point (framework layers call it on click). */
  activate(target: PdfLinkTarget, context?: LinkActivateContext): LinkActivation;
}

/** Engine-backed page cache (viewer-only deployments). */
export interface LinkState {
  pages: Record<number, LinkNavItem[]>;
}

export type LinkAction =
  | { type: 'SET_PAGE'; pon: number; items: LinkNavItem[] }
  | { type: 'DROP_PAGE'; pon: number };

export const LinkToken = createCapabilityToken<LinkCapability>('link');
