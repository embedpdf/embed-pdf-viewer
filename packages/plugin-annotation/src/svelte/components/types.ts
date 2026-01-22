import { Snippet } from 'svelte';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  VertexHandleUI,
  AnnotationSelectionMenuRenderFn,
  AnnotationSelectionMenuProps,
} from '../types';
import { VertexConfig } from '../../shared/types';
import { PdfAnnotationObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';

export interface AnnotationContainerProps<T extends PdfAnnotationObject> {
  documentId: string;
  scale: number;
  pageIndex: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  trackedAnnotation: TrackedAnnotation<T>;
  children: Snippet<[T]>;
  isSelected: boolean;
  /** Whether multiple annotations are selected (container becomes passive) */
  isMultiSelected?: boolean;
  isDraggable: boolean;
  isResizable: boolean;
  lockAspectRatio?: boolean;
  class?: string;
  style?: string;
  vertexConfig?: VertexConfig<T>;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  selectionMenuSnippet?: Snippet<[AnnotationSelectionMenuProps]>;
  outlineOffset?: number;
  onDoubleClick?: (event: any) => void;
  onSelect: (event: any) => void;
  zIndex?: number;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  selectionOutlineColor?: string;
  customAnnotationRenderer?: CustomAnnotationRenderer<T>;
}
