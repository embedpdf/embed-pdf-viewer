import type { Component } from 'svelte';
import type { PdfAnnotationObject, PdfBlendMode, Rect } from '@embedpdf/models';
import type { TrackedAnnotation, PreviewState } from '@embedpdf/plugin-annotation';
import type { VertexConfig } from '../../shared/types';

/**
 * Properly typed event for annotation interactions (click, select, etc.)
 */
export type AnnotationInteractionEvent = PointerEvent | MouseEvent;

/**
 * Props passed to custom annotation renderer components
 */
export interface AnnotationRendererProps<T extends PdfAnnotationObject = PdfAnnotationObject> {
  annotation: TrackedAnnotation<T>;
  currentObject: T;
  isSelected: boolean;
  isEditing: boolean;
  scale: number;
  pageIndex: number;
  documentId: string;
  onClick?: (e: AnnotationInteractionEvent) => void;
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
 * Entry for defining a custom annotation renderer.
 * Type safety enforced at definition time via generic.
 */
export interface AnnotationRendererEntry<
  T extends PdfAnnotationObject = PdfAnnotationObject,
  P = never,
> {
  /** Unique identifier for this renderer */
  id: string;
  /** Returns true if this renderer handles the annotation. Optional for preview-only renderers. */
  matches?: (annotation: PdfAnnotationObject) => annotation is T;
  /** Svelte component to render the annotation. Optional for preview-only renderers. */
  component?: Component<AnnotationRendererProps<T>>;

  /** Vertex configuration for annotations with draggable vertices (line, polyline, polygon) */
  vertexConfig?: VertexConfig<T>;
  /** z-index for the annotation container (default: 1, text markup uses 0) */
  zIndex?: number;
  /** Default blend mode for this annotation type (used when the annotation object has no blendMode set) */
  defaultBlendMode?: PdfBlendMode;
  /** Style applied to the annotation container — overrides the default blend-mode style. */
  containerStyle?: (annotation: T) => string;
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
  /** Returns true if this renderer should handle the given preview state */
  matchesPreview?: (preview: PreviewState) => boolean;
  /** Render a preview during drag-to-create. P is the preview data type. */
  renderPreview?: Component<{ data: P; bounds: Rect; scale: number }>;
  /** Extra styles merged onto the preview container div (e.g. mix-blend-mode for ink). */
  previewContainerStyle?: (props: { data: P; bounds: Rect; scale: number }) => string;
  /** When true, the annotation is completely hidden when locked (e.g., form widgets defer to the form-filling layer). */
  hiddenWhenLocked?: boolean;
  /** Optional locked-mode renderer. When the annotation is locked, this replaces `component` inside the container. */
  renderLocked?: Component<AnnotationRendererProps<T>>;
}

/**
 * Boxed renderer stored in registry (generic erased for storage)
 */
export interface BoxedAnnotationRenderer {
  id: string;
  matches: (annotation: PdfAnnotationObject) => boolean;
  component: Component<AnnotationRendererProps>;
  vertexConfig?: VertexConfig<PdfAnnotationObject>;
  zIndex?: number;
  defaultBlendMode?: PdfBlendMode;
  /** Style applied to the annotation container — overrides the default blend-mode style. */
  containerStyle?: (annotation: PdfAnnotationObject) => string;
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
  matchesPreview?: (preview: PreviewState) => boolean;
  renderPreview?: Component<{ data: unknown; bounds: Rect; scale: number }>;
  previewContainerStyle?: (props: { data: unknown; bounds: Rect; scale: number }) => string;
  hiddenWhenLocked?: boolean;
  renderLocked?: Component<AnnotationRendererProps>;
}
