import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  AnnotationCreateContext,
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  PdfErrorReason,
  PdfRenderPageAnnotationOptions,
  PdfTextAnnoObject,
  Position,
  Rect,
  Size,
  Task,
} from '@embedpdf/models';
import { AnnotationTool } from './tools/types';

export type AnnotationEvent =
  | {
      type: 'create';
      documentId: string;
      annotation: PdfAnnotationObject;
      pageIndex: number;
      ctx?: AnnotationCreateContext<any>;
      committed: boolean;
    }
  | {
      type: 'update';
      documentId: string;
      annotation: PdfAnnotationObject;
      pageIndex: number;
      patch: Partial<PdfAnnotationObject>;
      committed: boolean;
    }
  | {
      type: 'delete';
      documentId: string;
      annotation: PdfAnnotationObject;
      pageIndex: number;
      committed: boolean;
    }
  | { type: 'loaded'; documentId: string; total: number };

export type AnnotationToolsChangeEvent = {
  tools: AnnotationTool[];
};

export type CommitState = 'new' | 'dirty' | 'deleted' | 'synced' | 'ignored';

export interface TrackedAnnotation<T extends PdfAnnotationObject = PdfAnnotationObject> {
  commitState: CommitState;
  object: T;
}

/**
 * Represents a batch of pending annotation changes to be committed.
 * Separates the collection of changes from their execution.
 */
export interface CommitBatch {
  /** Annotations that need to be created in the PDF */
  creations: Array<{
    uid: string;
    ta: TrackedAnnotation;
    ctx?: AnnotationCreateContext<PdfAnnotationObject>;
  }>;
  /** Annotations that need to be updated in the PDF */
  updates: Array<{
    uid: string;
    ta: TrackedAnnotation;
  }>;
  /** Annotations that need to be deleted from the PDF */
  deletions: Array<{
    uid: string;
    ta: TrackedAnnotation;
  }>;
  /** All UIDs that are part of this commit batch */
  committedUids: string[];
  /** Whether this batch has any changes */
  isEmpty: boolean;
}

export interface RenderAnnotationOptions {
  pageIndex: number;
  annotation: PdfAnnotationObject;
  options?: PdfRenderPageAnnotationOptions;
}

// Per-document annotation state
export interface AnnotationDocumentState {
  pages: Record<number, string[]>;
  byUid: Record<string, TrackedAnnotation>;
  /** Array of selected annotation UIDs (supports multi-selection) */
  selectedUids: string[];
  /**
   * @deprecated Use `selectedUids` array or `getSelectedAnnotation()` instead.
   * Returns the UID only when exactly one annotation is selected, otherwise null.
   * Will be removed in next major version.
   */
  selectedUid: string | null;
  activeToolId: string | null;
  hasPendingChanges: boolean;
}

export interface AnnotationState {
  // Per-document annotation state
  documents: Record<string, AnnotationDocumentState>;
  activeDocumentId: string | null;

  // Global state (shared across all documents)
  /** The complete list of available tools, including any user modifications. */
  tools: AnnotationTool[];
  colorPresets: string[];
}

export interface AnnotationPluginConfig extends BasePluginConfig {
  /** A list of custom tools to add or default tools to override. */
  tools?: AnnotationTool[];
  colorPresets?: string[];
  /** When true (default), automatically commit the annotation changes into the PDF document. */
  autoCommit?: boolean;
  /** The author of the annotation. */
  annotationAuthor?: string;
  /** When true (default false), deactivate the active tool after creating an annotation. */
  deactivateToolAfterCreate?: boolean;
  /** When true (default false), select the annotation immediately after creation. */
  selectAfterCreate?: boolean;
}

/**
 * Options for transforming an annotation
 */
export interface TransformOptions<T extends PdfAnnotationObject = PdfAnnotationObject> {
  /** The type of transformation */
  type: 'move' | 'resize' | 'vertex-edit' | 'property-update';

  /** The changes to apply */
  changes: Partial<T>;

  /** Optional metadata */
  metadata?: {
    maintainAspectRatio?: boolean;
    [key: string]: any;
  };
}

/**
 * Function type for custom patch functions
 */
export type PatchFunction<T extends PdfAnnotationObject> = (
  original: T,
  context: TransformOptions<T>,
) => Partial<T>;

export type ImportAnnotationItem<T extends PdfAnnotationObject = PdfAnnotationObject> = {
  annotation: T;
  ctx?: AnnotationCreateContext<T>;
};

export interface AnnotationStateChangeEvent {
  documentId: string;
  state: AnnotationDocumentState;
}

export interface AnnotationActiveToolChangeEvent {
  documentId: string;
  tool: AnnotationTool | null;
}

// Scoped annotation capability for a specific document
export interface AnnotationScope {
  getState(): AnnotationDocumentState;
  getPageAnnotations(
    options: GetPageAnnotationsOptions,
  ): Task<PdfAnnotationObject[], PdfErrorReason>;
  /** @deprecated Use getSelectedAnnotations() for multi-select support. Returns first selected or null. */
  getSelectedAnnotation(): TrackedAnnotation | null;
  /** Get all selected annotations */
  getSelectedAnnotations(): TrackedAnnotation[];
  /** Get the IDs of all selected annotations */
  getSelectedAnnotationIds(): string[];
  getAnnotationById(id: string): TrackedAnnotation | null;
  /** Select a single annotation (clears previous selection) */
  selectAnnotation(pageIndex: number, annotationId: string): void;
  /** Toggle an annotation in/out of the current selection */
  toggleSelection(pageIndex: number, annotationId: string): void;
  /** Add an annotation to the current selection */
  addToSelection(pageIndex: number, annotationId: string): void;
  /** Remove an annotation from the current selection */
  removeFromSelection(annotationId: string): void;
  /** Set the selection to a specific set of annotation IDs (for marquee) */
  setSelection(ids: string[]): void;
  /** Clear all selection */
  deselectAnnotation(): void;
  getActiveTool(): AnnotationTool | null;
  setActiveTool(toolId: string | null): void;
  findToolForAnnotation(annotation: PdfAnnotationObject): AnnotationTool | null;
  importAnnotations(items: ImportAnnotationItem<PdfAnnotationObject>[]): void;
  createAnnotation<A extends PdfAnnotationObject>(
    pageIndex: number,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ): void;
  updateAnnotation(
    pageIndex: number,
    annotationId: string,
    patch: Partial<PdfAnnotationObject>,
  ): void;
  /** Batch update multiple annotations at once */
  updateAnnotations(
    patches: Array<{ pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> }>,
  ): void;
  deleteAnnotation(pageIndex: number, annotationId: string): void;
  /** Delete multiple annotations in batch */
  deleteAnnotations(annotations: Array<{ pageIndex: number; id: string }>): void;
  renderAnnotation(options: RenderAnnotationOptions): Task<Blob, PdfErrorReason>;
  commit(): Task<boolean, PdfErrorReason>;

  // Attached links (IRT link children)
  /** Get link annotations attached to an annotation via IRT relationship */
  getAttachedLinks(annotationId: string): TrackedAnnotation[];
  /** Check if an annotation has attached link children */
  hasAttachedLinks(annotationId: string): boolean;
  /** Delete all link annotations attached to an annotation */
  deleteAttachedLinks(annotationId: string): void;

  // Annotation grouping (RT = Group)
  /** Group the currently selected annotations (first selected becomes leader) */
  groupAnnotations(): void;
  /** Ungroup all annotations in the group containing the specified annotation */
  ungroupAnnotations(annotationId: string): void;
  /** Get all annotations in the same group as the specified annotation */
  getGroupMembers(annotationId: string): TrackedAnnotation<PdfAnnotationObject>[];
  /** Check if an annotation is part of a group */
  isInGroup(annotationId: string): boolean;

  onStateChange: EventHook<AnnotationDocumentState>;
  onAnnotationEvent: EventHook<AnnotationEvent>;
  onActiveToolChange: EventHook<AnnotationTool | null>;
}

export interface AnnotationCapability {
  // Active document operations
  getState: () => AnnotationDocumentState;
  getPageAnnotations: (
    options: GetPageAnnotationsOptions,
  ) => Task<PdfAnnotationObject[], PdfErrorReason>;
  /** @deprecated Use getSelectedAnnotations() for multi-select support. Returns first selected or null. */
  getSelectedAnnotation: () => TrackedAnnotation | null;
  /** Get all selected annotations */
  getSelectedAnnotations: () => TrackedAnnotation[];
  /** Get the IDs of all selected annotations */
  getSelectedAnnotationIds: () => string[];
  getAnnotationById(id: string): TrackedAnnotation | null;
  /** Select a single annotation (clears previous selection) */
  selectAnnotation: (pageIndex: number, annotationId: string) => void;
  /** Toggle an annotation in/out of the current selection */
  toggleSelection: (pageIndex: number, annotationId: string) => void;
  /** Add an annotation to the current selection */
  addToSelection: (pageIndex: number, annotationId: string) => void;
  /** Remove an annotation from the current selection */
  removeFromSelection: (annotationId: string) => void;
  /** Set the selection to a specific set of annotation IDs (for marquee) */
  setSelection: (ids: string[]) => void;
  /** Clear all selection */
  deselectAnnotation: () => void;
  importAnnotations: (items: ImportAnnotationItem<PdfAnnotationObject>[]) => void;
  createAnnotation: <A extends PdfAnnotationObject>(
    pageIndex: number,
    annotation: A,
    context?: AnnotationCreateContext<A>,
  ) => void;
  updateAnnotation: (
    pageIndex: number,
    annotationId: string,
    patch: Partial<PdfAnnotationObject>,
  ) => void;
  /** Batch update multiple annotations at once */
  updateAnnotations: (
    patches: Array<{ pageIndex: number; id: string; patch: Partial<PdfAnnotationObject> }>,
  ) => void;
  deleteAnnotation: (pageIndex: number, annotationId: string) => void;
  /** Delete multiple annotations in batch */
  deleteAnnotations: (
    annotations: Array<{ pageIndex: number; id: string }>,
    documentId?: string,
  ) => void;
  renderAnnotation: (options: RenderAnnotationOptions) => Task<Blob, PdfErrorReason>;
  commit: () => Task<boolean, PdfErrorReason>;

  // Attached links (IRT link children)
  /** Get link annotations attached to an annotation via IRT relationship */
  getAttachedLinks: (annotationId: string, documentId?: string) => TrackedAnnotation[];
  /** Check if an annotation has attached link children */
  hasAttachedLinks: (annotationId: string, documentId?: string) => boolean;
  /** Delete all link annotations attached to an annotation */
  deleteAttachedLinks: (annotationId: string, documentId?: string) => void;

  // Annotation grouping (RT = Group)
  /** Group the currently selected annotations (first selected becomes leader) */
  groupAnnotations: (documentId?: string) => void;
  /** Ungroup all annotations in the group containing the specified annotation */
  ungroupAnnotations: (annotationId: string, documentId?: string) => void;
  /** Get all annotations in the same group as the specified annotation */
  getGroupMembers: (
    annotationId: string,
    documentId?: string,
  ) => TrackedAnnotation<PdfAnnotationObject>[];
  /** Check if an annotation is part of a group */
  isInGroup: (annotationId: string, documentId?: string) => boolean;

  // Document-scoped operations
  forDocument: (documentId: string) => AnnotationScope;

  // Global operations (shared across documents)
  getActiveTool: () => AnnotationTool | null;
  setActiveTool: (toolId: string | null) => void;
  getTools: () => AnnotationTool[];
  getTool: <T extends AnnotationTool>(toolId: string) => T | undefined;
  addTool: <T extends AnnotationTool>(tool: T) => void;
  findToolForAnnotation: (annotation: PdfAnnotationObject) => AnnotationTool | null;
  setToolDefaults: (toolId: string, patch: Partial<any>) => void;

  getColorPresets: () => string[];
  addColorPreset: (color: string) => void;

  /**
   * Transform an annotation based on interaction (move, resize, etc.)
   * This applies annotation-specific logic to ensure consistency.
   */
  transformAnnotation: <T extends PdfAnnotationObject>(
    annotation: T,
    options: TransformOptions<T>,
  ) => Partial<T>;
  /**
   * Register a custom patch function for a specific annotation type.
   * This allows extending the transformation logic for custom annotations.
   */
  registerPatchFunction: <T extends PdfAnnotationObject>(
    type: PdfAnnotationSubtype,
    patchFn: PatchFunction<T>,
  ) => void;

  // Events (include documentId)
  onStateChange: EventHook<AnnotationStateChangeEvent>;
  onActiveToolChange: EventHook<AnnotationActiveToolChangeEvent>;
  onAnnotationEvent: EventHook<AnnotationEvent>;
  onToolsChange: EventHook<AnnotationToolsChangeEvent>;
}

export interface GetPageAnnotationsOptions {
  pageIndex: number;
}

export interface SidebarAnnotationEntry {
  page: number;
  annotation: TrackedAnnotation;
  replies: TrackedAnnotation<PdfTextAnnoObject>[];
}

// ─────────────────────────────────────────────────────────
// Multi-Drag Types (Internal - used by framework components)
// ─────────────────────────────────────────────────────────

/**
 * Information about an annotation needed for constraint calculation.
 * Passed to startMultiDrag to compute combined movement constraints.
 */
export interface AnnotationConstraintInfo {
  id: string;
  rect: Rect;
  pageIndex: number;
  pageSize: Size;
}

/**
 * Combined constraints representing the intersection of all selected annotations' movement limits.
 * These are the maximum distances the group can move in each direction without any annotation
 * leaving its page bounds.
 */
export interface CombinedConstraints {
  /** Maximum distance we can move up (positive = can move up) */
  maxUp: number;
  /** Maximum distance we can move down */
  maxDown: number;
  /** Maximum distance we can move left */
  maxLeft: number;
  /** Maximum distance we can move right */
  maxRight: number;
}

/**
 * State of the multi-drag operation for a document.
 */
export interface MultiDragState {
  /** The document this multi-drag belongs to */
  documentId: string;
  /** Whether a multi-drag is currently in progress */
  isDragging: boolean;
  /** The ID of the annotation being actively dragged (the "primary") */
  primaryId: string | null;
  /** Current cumulative delta (already clamped to constraints) */
  delta: Position;
  /** Combined constraints computed at drag start */
  combinedConstraints: CombinedConstraints | null;
  /** All annotation IDs participating in this multi-drag */
  participatingIds: string[];
}

/**
 * Event emitted when multi-drag state changes.
 */
export interface MultiDragEvent {
  /** The document this event belongs to */
  documentId: string;
  /** The type of change */
  type: 'start' | 'update' | 'end' | 'cancel';
  /** Current state */
  state: MultiDragState;
}

// ─────────────────────────────────────────────────────────
// Multi-Resize Types (Internal - used by framework components)
// ─────────────────────────────────────────────────────────

/**
 * Information about an annotation participating in group resize.
 * Includes its relative position within the group bounding box (0-1 normalized).
 */
export interface GroupResizeAnnotationInfo {
  id: string;
  rect: Rect;
  pageIndex: number;
  /** Relative X position within group (0-1) */
  relativeX: number;
  /** Relative Y position within group (0-1) */
  relativeY: number;
  /** Relative width within group (0-1) */
  relativeWidth: number;
  /** Relative height within group (0-1) */
  relativeHeight: number;
}

/**
 * State of the multi-resize operation for a document.
 */
export interface MultiResizeState {
  /** The document this multi-resize belongs to */
  documentId: string;
  /** Whether a multi-resize is currently in progress */
  isResizing: boolean;
  /** The original group bounding box at resize start */
  originalGroupBox: Rect;
  /** The current (resized) group bounding box */
  currentGroupBox: Rect;
  /** All annotations participating with their relative positions */
  participatingAnnotations: GroupResizeAnnotationInfo[];
  /** Which resize handle is being used */
  resizeHandle: string;
  /** Page index where the group resize is happening */
  pageIndex: number;
}

/**
 * Event emitted when multi-resize state changes.
 */
export interface MultiResizeEvent {
  /** The document this event belongs to */
  documentId: string;
  /** The type of change */
  type: 'start' | 'update' | 'end' | 'cancel';
  /** Current state */
  state: MultiResizeState;
  /** Per-annotation computed rects for convenience (id -> new rect) */
  computedRects: Record<string, Rect>;
}

/**
 * Input for starting a multi-resize operation.
 */
export interface StartMultiResizeOptions {
  documentId: string;
  pageIndex: number;
  annotations: Array<{ id: string; rect: Rect }>;
  resizeHandle: string;
}
