import { PdfAnnotationObject } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import {
  HandleElementProps,
  SelectionMenuPropsBase,
  SelectionMenuRenderFn,
} from '@embedpdf/utils/@framework';
import { JSX, CSSProperties, MouseEvent, TouchEvent } from '@framework';

export type ResizeDirection = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right' | 'none';

export interface AnnotationSelectionContext {
  type: 'annotation';
  annotation: TrackedAnnotation;
  pageIndex: number;
}

export type AnnotationSelectionMenuProps = SelectionMenuPropsBase<AnnotationSelectionContext>;
export type AnnotationSelectionMenuRenderFn = SelectionMenuRenderFn<AnnotationSelectionContext>;

export interface GroupSelectionContext {
  type: 'group';
  annotations: TrackedAnnotation[];
  pageIndex: number;
}

export type GroupSelectionMenuProps = SelectionMenuPropsBase<GroupSelectionContext>;
export type GroupSelectionMenuRenderFn = SelectionMenuRenderFn<GroupSelectionContext>;

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
  /** Color for the icon inside the handle (default: '#007ACC') */
  iconColor?: string;
  /** Resolved border configuration */
  border?: RotationHandleBorder;
}

export type BorderStyle = 'solid' | 'dashed' | 'dotted';

export interface SelectionOutline {
  /** Outline color (default: '#007ACC') */
  color?: string;
  /** Outline style (default: 'solid' for single, 'dashed' for group) */
  style?: BorderStyle;
  /** Outline width in px (default: 1 for single, 2 for group) */
  width?: number;
  /** Outline offset in px (default: 1 for single, 2 for group) */
  offset?: number;
}

/** Border configuration for the rotation handle */
export interface RotationHandleBorder {
  /** Border color (default: '#007ACC') */
  color?: string;
  /** Border style (default: 'solid') */
  style?: BorderStyle;
  /** Border width in px (default: 1) */
  width?: number;
}

/** UI customization for rotation handle */
export interface RotationHandleUI {
  /** Handle size in CSS px (default: 16) */
  size?: number;
  /** Gap in CSS px between the bounding box edge and the rotation handle center (default: 20) */
  margin?: number;
  /** Default background color for the handle (default: 'white') */
  color?: string;
  /** Color for the connector line (default: '#007ACC') */
  connectorColor?: string;
  /** Whether to show the connector line (default: true) */
  showConnector?: boolean;
  /** Color for the icon inside the handle (default: '#007ACC') */
  iconColor?: string;
  /** Border configuration for the handle */
  border?: RotationHandleBorder;
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

/**
 * Props for an annotation renderer entry
 */
export interface AnnotationRendererProps<T extends PdfAnnotationObject> {
  annotation: TrackedAnnotation<T>;
  isSelected: boolean;
  scale: number;
  pageIndex: number;
  onClick: (e: MouseEvent<Element> | TouchEvent<Element>) => void;
}

/**
 * Entry for a custom annotation renderer that handles specific annotation types.
 * This allows external plugins to provide their own rendering for annotation subtypes.
 * Used at definition time for type safety.
 */
export interface AnnotationRendererEntry<T extends PdfAnnotationObject = PdfAnnotationObject> {
  /** Unique identifier for this renderer (usually matches tool id) */
  id: string;

  /** Returns true if this renderer should handle the annotation */
  matches: (annotation: PdfAnnotationObject) => annotation is T;

  /** The component to render the annotation */
  render: (props: AnnotationRendererProps<T>) => JSX.Element;
}

/**
 * Props passed to tryRender (everything except annotation which is passed separately)
 */
export type BoxedRendererProps = Omit<AnnotationRendererProps<PdfAnnotationObject>, 'annotation'>;

/**
 * Boxed renderer that encapsulates type safety internally.
 * The generic is erased - this is what the registry actually stores.
 */
export interface BoxedAnnotationRenderer {
  /** Unique identifier for this renderer */
  id: string;

  /** Combined match + render: returns null if doesn't match, JSX.Element if it does */
  tryRender: (annotation: TrackedAnnotation, props: BoxedRendererProps) => JSX.Element | null;
}

/**
 * Creates a boxed renderer from a typed entry.
 * Type safety is enforced at definition time, then erased for storage.
 */
export function createRenderer<T extends PdfAnnotationObject>(
  entry: AnnotationRendererEntry<T>,
): BoxedAnnotationRenderer {
  return {
    id: entry.id,
    tryRender: (annotation, props) => {
      if (entry.matches(annotation.object)) {
        return entry.render({
          ...props,
          annotation: annotation as TrackedAnnotation<T>,
        });
      }
      return null;
    },
  };
}
