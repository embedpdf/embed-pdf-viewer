import { PdfAnnotationObject, PdfBlendMode } from '@embedpdf/models';
import { TrackedAnnotation } from '@embedpdf/plugin-annotation';
import {
  HandleElementProps,
  SelectionMenuPropsBase,
  SelectionMenuRenderFn,
} from '@embedpdf/utils/@framework';
import { JSX, CSSProperties, MouseEvent } from '@framework';
import { VertexConfig } from '../types';

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
 * Properly typed event for annotation interactions (click, select, etc.)
 */
export type AnnotationInteractionEvent = MouseEvent<Element>;

/**
 * Props for an annotation renderer entry
 */
export interface AnnotationRendererProps<T extends PdfAnnotationObject = PdfAnnotationObject> {
  annotation: TrackedAnnotation<T>;
  currentObject: T;
  isSelected: boolean;
  isEditing: boolean;
  scale: number;
  pageIndex: number;
  documentId: string;
  onClick: (e: AnnotationInteractionEvent) => void;
  /** When true, AP canvas provides the visual; component should only render hit area */
  appearanceActive: boolean;
}

/**
 * Helpers passed to selectOverride for custom selection behavior.
 */
export interface SelectOverrideHelpers {
  defaultSelect: (e: AnnotationInteractionEvent, annotation: TrackedAnnotation) => void;
  selectAnnotation: (pageIndex: number, id: string) => void;
  clearSelection: () => void;
  allAnnotations: TrackedAnnotation[];
  pageIndex: number;
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

  /** Vertex configuration for annotations with draggable vertices (line, polyline, polygon) */
  vertexConfig?: VertexConfig<T>;

  /** z-index for the annotation container (default: 1, text markup uses 0) */
  zIndex?: number;

  /** Default blend mode for this annotation type (used when annotation.blendMode is not set) */
  defaultBlendMode?: PdfBlendMode;

  /** Style applied to the annotation container — overrides the default blend-mode style. */
  containerStyle?: (annotation: T) => CSSProperties;

  /** Type-specific interaction fallbacks used when the tool doesn't define a property */
  interactionDefaults?: {
    isDraggable?: boolean;
    isResizable?: boolean;
    isRotatable?: boolean;
    lockAspectRatio?: boolean;
  };

  /** Whether this annotation type uses AP rendering before editing (default: true) */
  useAppearanceStream?: boolean;

  /** Override resolved isDraggable (e.g., FreeText disables drag while editing) */
  isDraggable?: (toolDraggable: boolean, context: { isEditing: boolean }) => boolean;

  /** Handle double-click on the annotation container */
  onDoubleClick?: (annotationId: string, setEditingId: (id: string) => void) => void;

  /** Override default selection behavior (e.g., Link IRT parent resolution) */
  selectOverride?: (
    e: AnnotationInteractionEvent,
    annotation: TrackedAnnotation<T>,
    helpers: SelectOverrideHelpers,
  ) => void;

  /** Return true to hide the selection menu for this annotation */
  hideSelectionMenu?: (annotation: T) => boolean;
}

/**
 * Boxed renderer that encapsulates type safety internally.
 * The generic is erased -- this is what the registry actually stores.
 */
export interface BoxedAnnotationRenderer {
  id: string;
  matches: (annotation: PdfAnnotationObject) => boolean;
  render: (props: AnnotationRendererProps) => JSX.Element;
  vertexConfig?: VertexConfig<PdfAnnotationObject>;
  zIndex?: number;
  defaultBlendMode?: PdfBlendMode;
  /** Style applied to the annotation container — overrides the default blend-mode style. */
  containerStyle?: (annotation: PdfAnnotationObject) => CSSProperties;
  interactionDefaults?: {
    isDraggable?: boolean;
    isResizable?: boolean;
    isRotatable?: boolean;
    lockAspectRatio?: boolean;
  };
  useAppearanceStream?: boolean;
  isDraggable?: (toolDraggable: boolean, context: { isEditing: boolean }) => boolean;
  onDoubleClick?: (annotationId: string, setEditingId: (id: string) => void) => void;
  selectOverride?: (
    e: AnnotationInteractionEvent,
    annotation: TrackedAnnotation,
    helpers: SelectOverrideHelpers,
  ) => void;
  hideSelectionMenu?: (annotation: PdfAnnotationObject) => boolean;
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
    matches: (annotation) => entry.matches(annotation),
    render: (props) => entry.render(props as AnnotationRendererProps<T>),
    vertexConfig: entry.vertexConfig as VertexConfig<PdfAnnotationObject> | undefined,
    zIndex: entry.zIndex,
    defaultBlendMode: entry.defaultBlendMode,
    containerStyle: entry.containerStyle as
      | ((annotation: PdfAnnotationObject) => CSSProperties)
      | undefined,
    interactionDefaults: entry.interactionDefaults,
    useAppearanceStream: entry.useAppearanceStream,
    isDraggable: entry.isDraggable,
    onDoubleClick: entry.onDoubleClick,
    selectOverride: entry.selectOverride as BoxedAnnotationRenderer['selectOverride'],
    hideSelectionMenu: entry.hideSelectionMenu as
      | ((annotation: PdfAnnotationObject) => boolean)
      | undefined,
  };
}
