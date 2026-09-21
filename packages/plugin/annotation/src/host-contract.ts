/**
 * @embedpdf/plugin-annotation/contract/host — the HOST lens: render
 * projections, hydration, pointer routing, ghosts, the markup bridge and the
 * extension seams. Same runtime token as the public one, typed wider.
 */
import type { CapabilityToken } from '@embedpdf/core';
import type { DocumentEvent, EventHook, Unsubscribe } from '@embedpdf/core';
import type {
  ChromeNode,
  Id,
  Rect,
  RenderItem,
  Subtype,
  TextEndAnchor,
  TextQuad,
  Vec,
  ViewEnv,
} from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import type {
  AnnotationAppearanceImage,
  AnnotationRef,
  PageMeasurementViewport,
  PageRef,
  PdfMeasure,
  PdfPoint,
  PdfRect,
  RichTextParagraph,
  SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import type { AnnotCommitEntry, AnnotCommitResult } from '@embedpdf/plugin-actions/contract/host';

import type {
  AnnotationCapability,
  AnnotationHydration,
  ArmedStampPreview,
  Behavior,
  LinkNavItem,
  TextItem,
  ToolGhost,
} from './contract';
import { AnnotationToken as PublicAnnotationToken } from './token';
import type { ResolvedTool } from './tools/definitions';

export * from './contract';
export type { AnnotationAction, AnnotationState } from './model';
export {
  ANNOTATION_DRAW_PRIORITY,
  ANNOTATION_EDIT_PRIORITY,
  ANNOTATION_GHOST_PRIORITY,
  ANNOTATION_MARQUEE_PRIORITY,
  ANNOTATION_PLACE_PRIORITY,
} from './priorities';

export interface RecalibrationReport {
  page: PageRef;
  scale: PdfMeasure;
  /** Page-wide read failure: no complete annotation set was available to recalculate. */
  error?: SerializedEngineError;
  updated: AnnotationRef[];
  skipped: {
    ref: AnnotationRef;
    reason: 'no-authority' | 'locked' | 'foreign-measure' | 'unavailable';
  }[];
  failed: { ref: AnnotationRef; error: SerializedEngineError }[];
}

export interface CapturedAnnotationDraft {
  tool: string;
  page: PageRef;
  /** Original PDF user space, matching the engine API. */
  from: PdfPoint;
  to: PdfPoint;
}

/**
 * Ghost render buckets: powers of two from 128 px up to `cap`. The same policy
 * the page renderer uses — one bitmap per size class, never per zoom step.
 */
export function previewBucket(devicePixelWidth: number, cap = 4096): number {
  const px = Math.max(128, Math.ceil(devicePixelWidth));
  return Math.min(cap, 2 ** Math.ceil(Math.log2(px)));
}

/**
 * The HOST (framework) surface: everything the render layer, the interaction hub,
 * and sibling plugins need, on top of the public {@link AnnotationCapability}.
 * Host-only — sibling plugins import the token from
 * `@embedpdf/plugin-annotation/contract/host`; framework implementation code may
 * use `/internal`. Never use either from application code.
 */
export interface AnnotationHostCapability extends AnnotationCapability {
  // ── measurement seam ──
  setPageViewports(
    page: PageRef,
    viewports: PageMeasurementViewport[] | undefined,
    fallback: PdfMeasure,
  ): void;
  remeasurePage(page: PageRef, scale: PdfMeasure): Promise<RecalibrationReport>;
  /** A distance draft was captured (the measurement plugin turns it into a calibration). */
  readonly onDraftCaptured: EventHook<CapturedAnnotationDraft>;
  distanceCreationPage(): PageRef | null;

  // ── render projections (page space; a view env projects for a rotated / zoomed view) ──
  listPageItems(page: PageRef, view?: ViewEnv): RenderItem[];
  listTextItems(page: PageRef, view?: ViewEnv): TextItem[];
  listChromeNodes(
    page: PageRef,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): ChromeNode[];
  listLinkItems(page: PageRef): LinkNavItem[];
  getAppearanceEpoch(page: PageRef): string;
  getBakeScale(renderScale: number): number;
  renderAppearances(
    page: PageRef,
    scale: number,
    signal?: AbortSignal,
  ): Promise<AnnotationAppearanceImage[]>;
  pdfToPageRect(page: PageRef, rect: PdfRect): Rect | null;

  // ── hydration ──
  getHydration(): AnnotationHydration;
  ensureHydrated(): void;
  reloadPage(page: PageRef): Promise<void>;
  deliverRemoteEvent(event: DocumentEvent): void;

  // ── text editing (the editor's draft path: optimistic, debounced engine write) ──
  getEditingId(): Id | null;
  beginTextEditAt(
    page: PageRef,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): boolean;
  draftContents(ref: AnnotationRef, text: string): void;
  draftRichText(ref: AnnotationRef, doc: { paragraphs: RichTextParagraph[] }): void;
  setTextSelection(ref: AnnotationRef, range: { start: number; end: number } | null): void;
  getCssFontFamily(family: string): string;

  // ── pointer routing ──
  getHitKind(
    page: PageRef,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
    touch?: boolean,
  ): 'handle' | 'rotate' | 'group-handle' | 'annot' | 'empty';
  claimsTouchAt(
    page: PageRef,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): boolean;
  getCursorAt(
    page: PageRef,
    point: Vec,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): string | null;
  hoverAt(
    at: {
      page: PageRef;
      point: Vec;
      scale?: number;
      rotation?: PageRotation;
      zoom?: number;
    } | null,
  ): void;
  editPointer(
    phase: 'down' | 'move' | 'up',
    page: PageRef,
    point: Vec,
    shift: boolean,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
    touch?: boolean,
  ): void;
  marqueePointer(
    phase: 'down' | 'move' | 'up',
    page: PageRef,
    point: Vec,
    shift: boolean,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): void;
  createPointer(
    tool: string,
    phase: 'down' | 'move' | 'up',
    page: PageRef,
    point: Vec,
    finish?: boolean,
    displayRotation?: PageRotation,
  ): void;
  finishInkDraft(): void;
  placeAt(page: PageRef, point: Vec, displayRotation?: PageRotation): boolean;
  placeArmedStamp(page: PageRef, point: Vec, displayRotation?: PageRotation): boolean;
  requestStampAt(page: PageRef, point: Vec, displayRotation?: PageRotation): boolean;

  // ── markup bridge (the selection plugin's commit path) ──
  createMarkup(subtype: Subtype, page: PageRef, quads: TextQuad[], preset?: string): void;
  createCaret(page: PageRef, anchor: TextEndAnchor): void;
  createReplaceText(page: PageRef, quads: TextQuad[], anchor: TextEndAnchor, preset?: string): void;
  previewMarkup(subtype: Subtype, quadsByPage: Record<number, TextQuad[]>, preset?: string): void;
  clearMarkupPreview(): void;

  // ── ghosts and previews ──
  hoverGhostAt(toolId: string, page: PageRef, point: Vec, displayRotation?: PageRotation): void;
  clearGhost(): void;
  setPlacementPreview(toolId: string, page: PageRef, box: Rect): void;
  clearPlacementPreview(): void;
  getToolGhost(page: PageRef): ToolGhost | null;
  getArmedStampPreview(devicePixelWidth?: number): Promise<ArmedStampPreview | null>;
  getStampArmEpoch(): number;

  // ── extension ──
  listResolvedTools(): ResolvedTool[];
  getResolvedTool(id: string): ResolvedTool | null;
  getToolSubtype(id: string): Subtype;
  registerBehavior(b: Behavior): Unsubscribe;
  getBehaviorFor(a: { subtype: Subtype; ref: AnnotationRef | null }): Behavior | null;
  pruneEngagedSelection(): void;
  commitScriptEffects(entries: AnnotCommitEntry[]): Promise<AnnotCommitResult>;
}

/**
 * The annotation capability token. Typed to the full {@link AnnotationHostCapability}
 * here (the package internals, `/contract/host`, and `/internal` use this view).
 * The package root re-exports the SAME token narrowed to
 * {@link AnnotationCapability}.
 */

/** The host lens over the public token: the same runtime object, typed to the full host capability. */
export const AnnotationToken =
  PublicAnnotationToken as unknown as CapabilityToken<AnnotationHostCapability>;
