/**
 * Svelte-specific types for annotation plugin
 * These types are separate from React types to avoid JSX dependencies
 */

import type { PdfAnnotationObject, Rect } from '@embedpdf/models';
import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import type { Snippet } from 'svelte';

export type ResizeDirection = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';

export interface SelectionMenuProps {
  annotation: TrackedAnnotation;
  selected: boolean;
  rect: Rect;
  menuWrapperProps: any; // MenuWrapperProps would need Svelte equivalent
}

export type SelectionMenu = Snippet<[SelectionMenuProps]>;

export interface HandleProps {
  backgroundColor?: string;
  [key: string]: any;
}

/** UI customization for resize handles */
export interface ResizeHandleUI {
  /** Handle size in CSS px (default: 12) */
  size?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Custom renderer for each handle (overrides default) */
  component?: Snippet<[HandleProps]>;
}

/** UI customization for vertex handles */
export interface VertexHandleUI {
  /** Handle size in CSS px (default: 12) */
  size?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Custom renderer for each vertex (overrides default) */
  component?: Snippet<[HandleProps]>;
}

/**
 * Props for the custom annotation renderer
 */
export interface CustomAnnotationRendererProps<T extends PdfAnnotationObject> {
  annotation: T;
  children: Snippet;
  isSelected: boolean;
  scale: number;
  rotation: number;
  pageWidth: number;
  pageHeight: number;
  pageIndex: number;
  onSelect: (event: any) => void;
}

/**
 * Custom renderer for an annotation
 */
export type CustomAnnotationRenderer<T extends PdfAnnotationObject> = Snippet<
  [CustomAnnotationRendererProps<T>]
>;
