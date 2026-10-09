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
  KindName,
  TextEndAnchor,
  Quad,
  Point,
  ViewEnv,
} from '@embedpdf/core-annotation';
import type { PageRotation } from '@embedpdf/core-geometry';
import type {
  AnnotationAppearanceImage,
  AnnotationRef,
  ImageSource,
  PageMeasurementViewport,
  PageRef,
  PdfMeasure,
  RichTextParagraph,
  SerializedEngineError,
} from '@embedpdf/engine-core/runtime';
import type { AnnotCommitEntry, AnnotCommitResult } from '@embedpdf/plugin-actions/contract/host';

import type {
  Annotation,
  AnnotationAnchor,
  AnnotationCapability,
  AnnotationSelectionAnchor,
  ArmedStampInfo,
  ArmedStampPreview,
  Behavior,
  LinkNavItem,
  TextItem,
  ImageGhost,
} from './contract';
import { AnnotationToken as PublicAnnotationToken } from './token';
import type { ResolvedTool } from './tools/definitions';

export * from './contract';
export type { AnnotationState } from './model';
export {
  ANNOTATION_DRAW_PRIORITY,
  ANNOTATION_EDIT_PRIORITY,
  ANNOTATION_MARQUEE_PRIORITY,
  ANNOTATION_PLACE_PRIORITY,
} from './priorities';

/**
 * One annotation's look at rest, as the render layer paints it: the engine's
 * picture, or, while the annotation's create is on its way, the one this
 * device made (a placed stamp's preview), which the engine's replaces.
 */
export interface AnnotationAppearancePicture extends Pick<
  AnnotationAppearanceImage,
  'ref' | 'mode' | 'state' | 'rect'
> {
  readonly image: ImageSource;
}

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
  from: Point;
  to: Point;
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
  /**
   * The selection's anchor as a page shows it: its rotation handle where the
   * page's view puts it (screen-sized, so it depends on the zoom), for a menu
   * that stays clear of it. `selection.getAnchor()` is the same without a view.
   */
  getSelectionAnchorIn(view: {
    scale?: number;
    rotation?: PageRotation;
    zoom?: number;
  }): AnnotationSelectionAnchor | null;
  /**
   * Where UI attaches to one annotation (its page and the box around what it
   * shows, a drag in progress included), or `null` for one that isn't here.
   * Without a view, an annotation that keeps its size on screen carries
   * `boundsIn` for the view it's shown in.
   */
  getAnnotationAnchor(ref: AnnotationRef, view?: ViewEnv): AnnotationAnchor | null;
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
  ): Promise<AnnotationAppearancePicture[]>;

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
  /** Place with the active tool at a click; `displayRotation` and `zoom` are the page's view there. */
  placeAt(page: PageRef, point: Point, displayRotation?: PageRotation, zoom?: number): boolean;
  placeArmedStamp(page: PageRef, point: Point, displayRotation?: PageRotation): boolean;
  requestStampAt(page: PageRef, point: Point, displayRotation?: PageRotation): boolean;

  // ── markup bridge (the selection plugin meets the text tools) ──
  /**
   * Turn the text selection into what the tool makes of it (markup, a caret,
   * a replace-text pair) and clear the selection; `false`, and nothing, for a
   * tool that makes nothing of a selection, without create authority, or
   * without a selection.
   */
  applyToolToSelection(toolId: string): boolean;
  createMarkup(subtype: KindName, page: PageRef, quads: Quad[], preset?: string): void;
  createCaret(page: PageRef, anchor: TextEndAnchor): void;
  createReplaceText(page: PageRef, quads: Quad[], anchor: TextEndAnchor, preset?: string): void;
  previewMarkup(subtype: KindName, quadsByPage: Record<number, Quad[]>, preset?: string): void;
  clearMarkupPreview(): void;

  // ── ghosts and previews (tools/ghost.ts) ──
  /**
   * Put the tool's ghost at a hover, what a click there would make;
   * `displayRotation` and `zoom` are the page's view there. The handler that
   * would take the click calls it, only where the click would reach it and
   * the user may create; a tool without a ghost clears it.
   */
  hoverGhostAt(
    toolId: string,
    page: PageRef,
    point: Point,
    displayRotation?: PageRotation,
    zoom?: number,
  ): void;
  clearGhost(): void;
  /**
   * A sibling plugin's placement gesture with one of this plugin's tools (the
   * form palette's drag-to-place): its press and the pointer now. Once it is a
   * drag, the page paints what releasing places; under that the tool's ghost
   * still shows the click.
   */
  previewPlacement(toolId: string, page: PageRef, from: Point, to: Point): void;
  clearPlacementPreview(): void;
  /** The armed stamp's ghost on a page, for the render layer's `<img>`. */
  getImageGhost(page: PageRef): ImageGhost | null;
  /** The armed stamp: a new object on every arm, null when nothing is armed. */
  getArmedStamp(): ArmedStampInfo | null;
  /** Render the armed stamp's ghost preview for a device pixel width (cached per size bucket). */
  renderArmedStampPreview(devicePixelWidth?: number): Promise<ArmedStampPreview | null>;

  // ── extension ──
  listResolvedTools(): ResolvedTool[];
  getResolvedTool(id: string): ResolvedTool | null;
  getToolSubtype(id: string): KindName;
  registerBehavior(behavior: Behavior): Unsubscribe;
  /** The engaged behavior that owns this annotation now, or `null`. */
  getBehaviorFor(annotation: Annotation): Behavior | null;
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
