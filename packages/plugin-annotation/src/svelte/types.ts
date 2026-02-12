/**
 * Svelte-specific types for annotation plugin
 * These types are separate from React types to avoid JSX dependencies
 */

import type { PdfAnnotationObject, Rect } from '@embedpdf/models';
import type { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import { SelectionMenuPropsBase, SelectionMenuRenderFn } from '@embedpdf/utils/svelte';
import type { Snippet } from 'svelte';

export type ResizeDirection = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';

export interface AnnotationSelectionContext {
  type: 'annotation';
  annotation: TrackedAnnotation;
  pageIndex: number;
}

export interface GroupSelectionContext {
  type: 'group';
  annotations: TrackedAnnotation[];
  pageIndex: number;
}

// For manual component props
export type AnnotationSelectionMenuProps = SelectionMenuPropsBase<AnnotationSelectionContext>;
export type AnnotationSelectionMenuRenderFn = SelectionMenuRenderFn<AnnotationSelectionContext>;

export type GroupSelectionMenuProps = SelectionMenuPropsBase<GroupSelectionContext>;
export type GroupSelectionMenuRenderFn = SelectionMenuRenderFn<GroupSelectionContext>;

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

/** Props for the rotation handle component */
export interface RotationHandleComponentProps extends HandleProps {
  /** Props for the connector line element */
  connectorStyle?: string;
  /** Whether to show the connector line */
  showConnector?: boolean;
  /** Color for the icon inside the handle (default: "white") */
  iconColor?: string;
  /** Opacity of the handle (0 during active rotation) */
  opacity?: number;
}

/** UI customization for rotation handle */
export interface RotationHandleUI {
  /** Handle size in CSS px (default: 32) */
  size?: number;
  /** Gap in CSS px between the bounding box edge and the rotation handle center (default: 20) */
  margin?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Color for the connector line (default: same as color) */
  connectorColor?: string;
  /** Whether to show the connector line (default: false) */
  showConnector?: boolean;
  /** Color for the icon inside the handle (default: "white") */
  iconColor?: string;
  /** Custom renderer for the rotation handle (overrides default) */
  component?: Snippet<[RotationHandleComponentProps]>;
}

export type SelectionOutlineStyle = 'solid' | 'dashed' | 'dotted';

/** Customize the selection outline (color, style, width, offset) */
export interface SelectionOutline {
  /** Outline color (default: '#007ACC') */
  color?: string;
  /** Outline style (default: 'solid' for single, 'dashed' for group) */
  style?: SelectionOutlineStyle;
  /** Outline width in px (default: 1 for single, 2 for group) */
  width?: number;
  /** Outline offset in px (default: 1 for single, 2 for group) */
  offset?: number;
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
