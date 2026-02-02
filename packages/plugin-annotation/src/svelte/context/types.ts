import type { Component } from 'svelte';
import type { PdfAnnotationObject } from '@embedpdf/models';
import type { TrackedAnnotation } from '../../lib';

/**
 * Props passed to custom annotation renderer components
 */
export interface AnnotationRendererProps<T extends PdfAnnotationObject = PdfAnnotationObject> {
  annotation: TrackedAnnotation<T>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick: (e: PointerEvent | TouchEvent) => void;
}

/**
 * Entry for defining a custom annotation renderer.
 * Type safety enforced at definition time via generic.
 */
export interface AnnotationRendererEntry<T extends PdfAnnotationObject = PdfAnnotationObject> {
  /** Unique identifier for this renderer */
  id: string;
  /** Returns true if this renderer handles the annotation */
  matches: (annotation: PdfAnnotationObject) => annotation is T;
  /** Svelte component to render the annotation */
  component: Component<AnnotationRendererProps<T>>;
}

/**
 * Boxed renderer stored in registry (generic erased for storage)
 */
export interface BoxedAnnotationRenderer {
  id: string;
  matches: (annotation: PdfAnnotationObject) => boolean;
  component: Component<AnnotationRendererProps>;
}
