import { Snippet } from 'svelte';
import {
  CustomAnnotationRenderer,
  ResizeHandleUI,
  VertexHandleUI,
  RotationHandleUI,
  SelectionOutline,
  AnnotationSelectionMenuRenderFn,
  AnnotationSelectionMenuProps,
  GroupSelectionMenuRenderFn,
} from '../types';
import { VertexConfig } from '../../shared/types';
import { PdfAnnotationObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import type { BoxedAnnotationRenderer } from '../context';

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
  isRotatable?: boolean;
  lockAspectRatio?: boolean;
  class?: string;
  style?: string;
  vertexConfig?: VertexConfig<T>;
  selectionMenu?: AnnotationSelectionMenuRenderFn;
  selectionMenuSnippet?: Snippet<[AnnotationSelectionMenuProps]>;
  /** @deprecated Use `selectionOutline.offset` instead */
  outlineOffset?: number;
  onDoubleClick?: (event: any) => void;
  onSelect: (event: any) => void;
  zIndex?: number;
  resizeUI?: ResizeHandleUI;
  vertexUI?: VertexHandleUI;
  rotationUI?: RotationHandleUI;
  /** @deprecated Use `selectionOutline.color` instead */
  selectionOutlineColor?: string;
  /** Customize the selection outline (color, style, width, offset) */
  selectionOutline?: SelectionOutline;
  customAnnotationRenderer?: CustomAnnotationRenderer<T>;
  /** Passed from parent but not used - destructured to prevent DOM spread */
  groupSelectionMenu?: GroupSelectionMenuRenderFn;
  /** Passed from parent but not used - destructured to prevent DOM spread */
  groupSelectionOutline?: SelectionOutline;
  /** Passed from parent but not used - destructured to prevent DOM spread */
  annotationRenderers?: BoxedAnnotationRenderer[];
}
