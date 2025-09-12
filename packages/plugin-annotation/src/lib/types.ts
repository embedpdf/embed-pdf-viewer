import { BasePluginConfig, EventHook } from '@embedpdf/core';
import {
  AnnotationCreateContext,
  PdfAnnotationObject,
  PdfErrorReason,
  PdfRenderPageAnnotationOptions,
  PdfTextAnnoObject,
  Task,
} from '@embedpdf/models';
import { AnnotationTool } from './tools/types';

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
  autoCommit?: boolean;
  annotationAuthor?: string;
}

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
  findToolForAnnotation: (annotation: PdfAnnotationObject) => AnnotationTool | null;
  setToolDefaults: (toolId: string, patch: Partial<any>) => void;

  getColorPresets: () => string[];
  addColorPreset: (color: string) => void;

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

  onStateChange: EventHook<AnnotationState>;
  onActiveToolChange: EventHook<AnnotationTool | null>;
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
