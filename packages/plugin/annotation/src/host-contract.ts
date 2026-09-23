/**
 * @embedpdf/plugin-annotation/contract/host — the host lens: render
 * projections, sync, pointer routing, ghosts, the markup bridge and the
 * extension seams. Same runtime token as the public one, typed wider.
 */
import { createHostToken } from '@embedpdf/core';
import type { DocumentEvent, EventHook, Unsubscribe } from '@embedpdf/core';
import type {
  ChromeNode,
  Id,
  Rect,
  RenderItem,
  Subtype,
  TextEndAnchor,
  TextQuad,
  Point,
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
  ArmedStampInfo,
  ArmedStampPreview,
  Behavior,
  LinkNavItem,
  TextItem,
  ToolGhost,
} from './contract';
import { AnnotationToken as PublicAnnotationToken } from './token';
import type { ResolvedTool } from './tools/definitions';

export * from './contract';
export type { AnnotationState } from './model';
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
export function previewBucket(devicePixelWidth: number, maxWidth = 4096): number {
  const px = Math.max(128, Math.ceil(devicePixelWidth));
  return Math.min(maxWidth, 2 ** Math.ceil(Math.log2(px)));
}

/**
 * The host (framework) surface: everything the render layer, the interaction hub,
 * and sibling plugins need, on top of the public {@link AnnotationCapability}.
 * Host-only: sibling plugins and framework adapters import the token from
 * `@embedpdf/plugin-annotation/contract/host`. Never use it from application code.
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

  // ── sync ──
  /**
   * Resolves once the annotations mirror has applied every confirmed change
   * it knows of, including page re-reads that events started.
   */
  whenSynced(): Promise<void>;

  // ── text editing (the editor's draft path: shown at once, written after a pause) ──
  getEditingId(): Id | null;
  beginTextEditAt(
    page: PageRef,
    point: Point,
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
    point: Point,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
    touch?: boolean,
  ): 'handle' | 'rotate' | 'group-handle' | 'annot' | 'empty';
  claimsTouchAt(
    page: PageRef,
    point: Point,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): boolean;
  getCursorAt(
    page: PageRef,
    point: Point,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): string | null;
  hoverAt(
    at: {
      page: PageRef;
      point: Point;
      scale?: number;
      rotation?: PageRotation;
      zoom?: number;
    } | null,
  ): void;
  editPointer(
    phase: 'down' | 'move' | 'up',
    page: PageRef,
    point: Point,
    shift: boolean,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
    touch?: boolean,
  ): void;
  marqueePointer(
    phase: 'down' | 'move' | 'up',
    page: PageRef,
    point: Point,
    shift: boolean,
    scale?: number,
    rotation?: PageRotation,
    zoom?: number,
  ): void;
  createPointer(
    tool: string,
    phase: 'down' | 'move' | 'up',
    page: PageRef,
    point: Point,
    finish?: boolean,
    displayRotation?: PageRotation,
  ): void;
  finishInkDraft(): void;
  placeAt(page: PageRef, point: Point, displayRotation?: PageRotation): boolean;
  placeArmedStamp(page: PageRef, point: Point, displayRotation?: PageRotation): boolean;
  requestStampAt(page: PageRef, point: Point, displayRotation?: PageRotation): boolean;

  // ── markup bridge (the selection plugin's commit path) ──
  createMarkup(subtype: Subtype, page: PageRef, quads: TextQuad[], preset?: string): void;
  createCaret(page: PageRef, anchor: TextEndAnchor): void;
  createReplaceText(page: PageRef, quads: TextQuad[], anchor: TextEndAnchor, preset?: string): void;
  previewMarkup(subtype: Subtype, quadsByPage: Record<number, TextQuad[]>, preset?: string): void;
  clearMarkupPreview(): void;

  // ── ghosts and previews ──
  hoverGhostAt(toolId: string, page: PageRef, point: Point, displayRotation?: PageRotation): void;
  clearGhost(): void;
  setPlacementPreview(toolId: string, page: PageRef, box: Rect): void;
  clearPlacementPreview(): void;
  getToolGhost(page: PageRef): ToolGhost | null;
  /** The armed stamp: a new object on every arm, null when nothing is armed. */
  getArmedStamp(): ArmedStampInfo | null;
  /** Render the armed stamp's ghost preview for a device pixel width (cached per size bucket). */
  renderArmedStampPreview(devicePixelWidth?: number): Promise<ArmedStampPreview | null>;

  // ── extension ──
  listResolvedTools(): ResolvedTool[];
  getResolvedTool(id: string): ResolvedTool | null;
  getToolSubtype(id: string): Subtype;
  registerBehavior(behavior: Behavior): Unsubscribe;
  getBehaviorFor(annotation: { subtype: Subtype; ref: AnnotationRef | null }): Behavior | null;
  pruneEngagedSelection(): void;
  commitScriptEffects(entries: AnnotCommitEntry[]): Promise<AnnotCommitResult>;
}

/**
 * The annotation capability token, typed to the full
 * {@link AnnotationHostCapability} (the package internals and `/contract/host`
 * use this view). The package root exports the same runtime token narrowed to
 * {@link AnnotationCapability}.
 */
export const AnnotationToken = createHostToken<AnnotationHostCapability>(PublicAnnotationToken);
