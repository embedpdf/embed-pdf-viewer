import { createCapabilityToken, type PageObjectNumber } from '@embedpdf-x/kernel';
import type { PdfDestination, PdfLinkTarget } from '@embedpdf/engine-core/runtime';
import type { LinkNavItem } from '@embedpdf-x/plugin-annotation';

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
  | { outcome: 'none' };

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
  activate(target: PdfLinkTarget): LinkActivation;
}

/** Engine-backed page cache (viewer-only deployments). */
export interface LinkState {
  pages: Record<number, LinkNavItem[]>;
}

export type LinkAction =
  | { type: 'SET_PAGE'; pon: number; items: LinkNavItem[] }
  | { type: 'DROP_PAGE'; pon: number };

export const LinkToken = createCapabilityToken<LinkCapability>('link');
