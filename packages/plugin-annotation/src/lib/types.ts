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

/**
 * Metadata attached to annotation history commands for filtering/purging.
 * Used by the history plugin's purgeByMetadata method to identify commands
 * that should be removed (e.g., after a permanent redaction commit).
 */
export interface AnnotationCommandMetadata {
  /** The annotation IDs affected by this command */
  annotationIds: string[];
}

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

/**
 * Partial tool definition for overriding default tools by ID.
 * When a tool with the same `id` as a default tool is provided, its properties
 * are deep-merged with the default (user values take precedence).
 */
export type AnnotationToolOverride = { id: string } & Partial<Omit<AnnotationTool, 'id'>>;

export interface AnnotationPluginConfig extends BasePluginConfig {
  /**
   * A list of tools to add or override. If a tool's `id` matches a default tool,
   * it is deep-merged with the default (partial overrides are supported).
   * New tools (unmatched `id`) are added as-is.
   */
  tools?: (AnnotationTool | AnnotationToolOverride)[];
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
  type: 'move' | 'resize' | 'vertex-edit' | 'rotate' | 'property-update';

  /** The changes to apply */
  changes: Partial<T>;

  /** Optional metadata */
  metadata?: {
    maintainAspectRatio?: boolean;
    /** Rotation angle in degrees (for 'rotate' transform type) */
    rotationAngle?: number;
    /** Delta from the initial rotation angle in degrees */
    rotationDelta?: number;
    /** Center point for rotation (defaults to rect center) */
    rotationCenter?: { x: number; y: number };
    /** Whether the rotation is currently snapped to a guide */
    isSnapped?: boolean;
    /** Snap target angle when isSnapped is true */
    snappedAngle?: number;
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

/**
 * Represents what grouping action is available for the current selection.
 * - 'group': Selection can be grouped (2+ annotations, not all in same group)
 * - 'ungroup': Selection is exactly one complete group that can be ungrouped
 * - 'disabled': No valid grouping action (0-1 annotations selected)
 */
export type GroupingAction = 'group' | 'ungroup' | 'disabled';

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
  /** Remove an annotation from state without calling the engine (no PDF modification) */
  purgeAnnotation(pageIndex: number, annotationId: string): void;
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
  /** Get the available grouping action for the current selection */
  getGroupingAction(): GroupingAction;

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
  /** Remove an annotation from state without calling the engine (no PDF modification) */
  purgeAnnotation: (pageIndex: number, annotationId: string, documentId?: string) => void;
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
// Constraint Types (Used by unified drag/resize APIs)
// ─────────────────────────────────────────────────────────

/**
 * Information about an annotation needed for constraint calculation.
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

// ─────────────────────────────────────────────────────────
// Unified Drag API Types (Plugin owns all logic)
// ─────────────────────────────────────────────────────────

/**
 * Options for starting a unified drag operation.
 * The plugin will automatically expand to include attached links.
 */
export interface UnifiedDragOptions {
  /** The explicitly selected/dragged annotation IDs */
  annotationIds: string[];
  /** Page size for constraint calculation */
  pageSize: Size;
}

/**
 * State of the unified drag operation.
 * Managed entirely by the plugin - framework components just subscribe.
 */
export interface UnifiedDragState {
  /** The document this drag belongs to */
  documentId: string;
  /** Whether a drag is currently in progress */
  isDragging: boolean;
  /** The explicitly selected annotation IDs (what the user selected) */
  primaryIds: string[];
  /** Auto-expanded attached link IDs */
  attachedLinkIds: string[];
  /** All participant IDs (primaryIds + attachedLinkIds) */
  allParticipantIds: string[];
  /** Original rects for all participants (for computing final patches) */
  originalRects: Map<string, Rect>;
  /** Current cumulative delta (already clamped to constraints) */
  delta: Position;
  /** Combined constraints computed at drag start */
  combinedConstraints: CombinedConstraints;
}

/**
 * Event emitted when unified drag state changes.
 */
export interface UnifiedDragEvent {
  /** The document this event belongs to */
  documentId: string;
  /** The type of change */
  type: 'start' | 'update' | 'end' | 'cancel';
  /** Current state */
  state: UnifiedDragState;
  /** Pre-computed patches for ALL participants - components just apply directly! */
  previewPatches: Record<string, Partial<PdfAnnotationObject>>;
}

// ─────────────────────────────────────────────────────────
// Unified Resize API Types (Plugin owns all logic)
// ─────────────────────────────────────────────────────────

/**
 * Options for starting a unified resize operation.
 * The plugin will automatically expand to include attached links.
 */
export interface UnifiedResizeOptions {
  /** The explicitly selected annotation IDs */
  annotationIds: string[];
  /** Page size for constraint calculation */
  pageSize: Size;
  /** Which resize handle is being used */
  resizeHandle: string;
}

/**
 * Information about an annotation participating in unified resize.
 */
export interface UnifiedResizeAnnotationInfo {
  id: string;
  originalRect: Rect;
  /** The original unrotated rect at resize start (only for rotated annotations) */
  originalUnrotatedRect?: Rect;
  pageIndex: number;
  /** Whether this is an attached link (auto-expanded) */
  isAttachedLink: boolean;
  /** The parent annotation ID (if this is an attached link) */
  parentId?: string;
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
 * State of the unified resize operation.
 * Managed entirely by the plugin - framework components just subscribe.
 */
export interface UnifiedResizeState {
  /** The document this resize belongs to */
  documentId: string;
  /** Whether a resize is currently in progress */
  isResizing: boolean;
  /** Whether this is a group resize (multiple primary annotations) */
  isGroupResize: boolean;
  /** The explicitly selected annotation IDs (what the user selected) */
  primaryIds: string[];
  /** Auto-expanded attached link IDs */
  attachedLinkIds: string[];
  /** All participant IDs (primaryIds + attachedLinkIds) */
  allParticipantIds: string[];
  /** The original group bounding box at resize start */
  originalGroupBox: Rect;
  /** The current (resized) group bounding box */
  currentGroupBox: Rect;
  /** All annotations participating with their relative positions */
  participatingAnnotations: UnifiedResizeAnnotationInfo[];
  /** Which resize handle is being used */
  resizeHandle: string;
  /** Current computed rects for all participants */
  computedRects: Map<string, Rect>;
}

/**
 * Event emitted when unified resize state changes.
 */
export interface UnifiedResizeEvent {
  /** The document this event belongs to */
  documentId: string;
  /** The type of change */
  type: 'start' | 'update' | 'end' | 'cancel';
  /** Current state */
  state: UnifiedResizeState;
  /** Per-annotation computed rects for convenience (id -> new rect) */
  computedRects: Record<string, Rect>;
  /** Pre-computed patches for ALL participants - components just apply directly! */
  previewPatches: Record<string, Partial<PdfAnnotationObject>>;
}

// ─────────────────────────────────────────────────────────
// Unified Rotation API Types
// ─────────────────────────────────────────────────────────

export interface UnifiedRotateOptions {
  /** The explicitly selected annotation IDs */
  annotationIds: string[];
  /** Angle reported by the interaction controller at gesture start */
  cursorAngle: number;
  /** Optional rotation center override (defaults to selection center) */
  rotationCenter?: Position;
}

export interface UnifiedRotateParticipant {
  id: string;
  rect: Rect;
  pageIndex: number;
  rotation: number;
  unrotatedRect?: Rect;
  isAttachedLink: boolean;
  parentId?: string;
}

export interface UnifiedRotateState {
  documentId: string;
  isRotating: boolean;
  primaryIds: string[];
  attachedLinkIds: string[];
  allParticipantIds: string[];
  rotationCenter: Position;
  cursorStartAngle: number;
  currentAngle: number;
  delta: number;
  participants: UnifiedRotateParticipant[];
}

export interface UnifiedRotateEvent {
  documentId: string;
  type: 'start' | 'update' | 'end' | 'cancel';
  state: UnifiedRotateState;
  previewPatches: Record<string, Partial<PdfAnnotationObject>>;
}
