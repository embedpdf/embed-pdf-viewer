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
      annotation: PdfAnnotationObject;
      pageIndex: number;
      ctx?: AnnotationCreateContext<any>;
      committed: boolean;
    }
  | {
      type: 'update';
      annotation: PdfAnnotationObject;
      pageIndex: number;
      patch: Partial<PdfAnnotationObject>;
      committed: boolean;
    }
  | { type: 'delete'; annotation: PdfAnnotationObject; pageIndex: number; committed: boolean }
  | { type: 'loaded'; total: number };

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

export interface AnnotationState {
  pages: Record<number, string[]>;
  byUid: Record<string, TrackedAnnotation>;
  selectedUid: string | null;
  activeToolId: string | null;

  /** The complete list of available tools, including any user modifications. */
  tools: AnnotationTool[];

  colorPresets: string[];
  hasPendingChanges: boolean;
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

export interface AnnotationCapability {
  getPageAnnotations: (
    options: GetPageAnnotationsOptions,
  ) => Task<PdfAnnotationObject[], PdfErrorReason>;
  getSelectedAnnotation: () => TrackedAnnotation | null;
  selectAnnotation: (pageIndex: number, annotationId: string) => void;
  deselectAnnotation: () => void;

  getActiveTool: () => AnnotationTool | null;
  setActiveTool: (toolId: string | null) => void;
  getTools: () => AnnotationTool[];
  getTool: <T extends AnnotationTool>(toolId: string) => T | undefined;
  addTool: <T extends AnnotationTool>(tool: T) => void;
  findToolForAnnotation: (annotation: PdfAnnotationObject) => AnnotationTool | null;
  setToolDefaults: (toolId: string, patch: Partial<any>) => void;

  getColorPresets: () => string[];
  addColorPreset: (color: string) => void;

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

  renderAnnotation: (options: RenderAnnotationOptions) => Task<Blob, PdfErrorReason>;

  onStateChange: EventHook<AnnotationState>;
  onActiveToolChange: EventHook<AnnotationTool | null>;
  onAnnotationEvent: EventHook<AnnotationEvent>;
  commit: () => Task<boolean, PdfErrorReason>;
}

export interface GetPageAnnotationsOptions {
  pageIndex: number;
}

export interface SidebarAnnotationEntry {
  page: number;
  annotation: TrackedAnnotation;
  replies: TrackedAnnotation<PdfTextAnnoObject>[];
}
