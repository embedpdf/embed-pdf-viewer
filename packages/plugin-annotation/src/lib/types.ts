import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  AnnotationCreateContext,
  PdfAnnotationObject,
  PdfAnnotationSubtype,
  PdfErrorReason,
  PdfRenderPageAnnotationOptions,
  PdfTextAnnoObject,
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

export interface RenderAnnotationOptions {
  pageIndex: number;
  annotation: PdfAnnotationObject;
  options?: PdfRenderPageAnnotationOptions;
}

// Per-document annotation state
export interface AnnotationDocumentState {
  pages: Record<number, string[]>;
  byUid: Record<string, TrackedAnnotation>;
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
  getSelectedAnnotation(): TrackedAnnotation | null;
  getAnnotationById(id: string): TrackedAnnotation | null;
  selectAnnotation(pageIndex: number, annotationId: string): void;
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
  deleteAnnotation(pageIndex: number, annotationId: string): void;
  renderAnnotation(options: RenderAnnotationOptions): Task<Blob, PdfErrorReason>;
  commit(): Task<boolean, PdfErrorReason>;
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
  getSelectedAnnotation: () => TrackedAnnotation | null;
  getAnnotationById(id: string): TrackedAnnotation | null;
  selectAnnotation: (pageIndex: number, annotationId: string) => void;
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
  deleteAnnotation: (pageIndex: number, annotationId: string) => void;
  renderAnnotation: (options: RenderAnnotationOptions) => Task<Blob, PdfErrorReason>;
  commit: () => Task<boolean, PdfErrorReason>;

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
