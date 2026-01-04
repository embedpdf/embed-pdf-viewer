import { PdfAnnotationObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import {
  HandleElementProps,
  SelectionMenuPropsBase,
  SelectionMenuRenderFn,
} from '@embedpdf/utils/@framework';
import { JSX, CSSProperties } from '@framework';

export type ResizeDirection = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';

export interface AnnotationSelectionContext {
  type: 'annotation';
  annotation: TrackedAnnotation;
  pageIndex: number;
}

export type AnnotationSelectionMenuProps = SelectionMenuPropsBase<AnnotationSelectionContext>;
export type AnnotationSelectionMenuRenderFn = SelectionMenuRenderFn<AnnotationSelectionContext>;

export type HandleProps = HandleElementProps & {
  backgroundColor?: string;
};

/** UI customization for resize handles */
export interface ResizeHandleUI {
  /** Handle size in CSS px (default: 12) */
  size?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Custom renderer for each handle (overrides default) */
  component?: (p: HandleProps) => JSX.Element;
}

/** UI customization for vertex handles */
export interface VertexHandleUI {
  /** Handle size in CSS px (default: 12) */
  size?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Custom renderer for each vertex (overrides default) */
  component?: (p: HandleProps) => JSX.Element;
}

/** Props for the rotation handle component */
export interface RotationHandleComponentProps extends HandleProps {
  /** Props for the connector line element */
  connectorStyle?: CSSProperties;
  /** Whether to show the connector line */
  showConnector?: boolean;
}

/** UI customization for rotation handle */
export interface RotationHandleUI {
  /** Handle size in CSS px (default: 16) */
  size?: number;
  /** Distance from the center of the bounding box to the handle (default: auto-calculated) */
  radius?: number;
  /** Default background color for the handle (used by default renderer) */
  color?: string;
  /** Color for the connector line (default: same as color) */
  connectorColor?: string;
  /** Whether to show the connector line (default: true) */
  showConnector?: boolean;
  /** Custom renderer for the rotation handle (overrides default) */
  component?: (p: RotationHandleComponentProps) => JSX.Element;
}

/**
 * Props for the custom annotation renderer
 */
export interface CustomAnnotationRendererProps<T extends PdfAnnotationObject> {
  annotation: T;
  children: JSX.Element;
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
export type CustomAnnotationRenderer<T extends PdfAnnotationObject> = (
  props: CustomAnnotationRendererProps<T>,
) => JSX.Element | null;
