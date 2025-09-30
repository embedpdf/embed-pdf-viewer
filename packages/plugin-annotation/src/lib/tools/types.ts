import { PdfAnnotationObject, PdfAnnotationSubtype, Size } from '@embedpdf/models';

/**
 * Specific configuration for Stamp tools.
 */
export interface StampToolConfig {
  /** The base64 or URL source for the stamp's image. */
  imageSrc?: string;
  imageSize?: Size;
}

/**
 * Click behavior for shape annotations (Circle, Square)
 */
export interface ShapeClickBehavior {
  /** If true, creates annotation on click with default size */
  enabled: boolean;
  /** Default size to use when clicking (PDF units) */
  defaultSize: Size;
}

/**
 * Click behavior for line annotations
 */
export interface LineClickBehavior {
  /** If true, creates annotation on click with default length */
  enabled: boolean;
  /** Default length of the line */
  defaultLength: number;
  /** Default angle in radians (0 = horizontal right) */
  defaultAngle?: number;
}

/**
 * Click behavior for free text annotations
 */
export interface FreeTextClickBehavior {
  /** If true, creates annotation on click with default size */
  enabled: boolean;
  /** Default size for the text box */
  defaultSize: Size;
  /** Optional default content */
  defaultContent?: string;
}

/**
 * A central, extensible map that associates an annotation subtype
 * with its unique tool configuration interface.
 */
export interface ToolConfigMap {
  [PdfAnnotationSubtype.STAMP]: StampToolConfig;
}

/**
 * Map of annotation subtypes to their click behavior configuration
 */
export interface ClickBehaviorMap {
  [PdfAnnotationSubtype.CIRCLE]: ShapeClickBehavior;
  [PdfAnnotationSubtype.SQUARE]: ShapeClickBehavior;
  [PdfAnnotationSubtype.LINE]: LineClickBehavior;
  [PdfAnnotationSubtype.FREETEXT]: FreeTextClickBehavior;
}

// Helper type to get tool config
type GetToolConfig<T extends PdfAnnotationObject> = T['type'] extends keyof ToolConfigMap
  ? ToolConfigMap[T['type']]
  : {};

// Helper type to get click behavior config
type ClickBehaviorFor<T extends PdfAnnotationObject> =
  // if none of T['type'] is in ClickBehaviorMap, omit the property
  Extract<T['type'], keyof ClickBehaviorMap> extends never
    ? {}
    : {
        // otherwise allow it, with the right unioned type
        clickBehavior?: ClickBehaviorMap[Extract<T['type'], keyof ClickBehaviorMap>];
      };

/**
 * The primary interface for defining an annotation tool.
 * Uses a type alias to properly combine the base interface with conditional properties.
 */
export type AnnotationTool<T extends PdfAnnotationObject = PdfAnnotationObject> = {
  /** A unique identifier, e.g., 'ink', 'arrow' */
  id: string;

  /** A user-facing name for UI elements, e.g., 'Pen' */
  name: string;

  /**
   * Determines how well this tool matches an existing annotation.
   * Higher numbers indicate a more specific match.
   */
  matchScore: (annotation: PdfAnnotationObject) => number;

  /**
   * The defaults combine the base annotation properties (Partial<T>)
   * with any custom tool configuration (C) found in the ToolConfigMap.
   */
  defaults: Partial<T> & GetToolConfig<T>;

  /** Defines how this tool interacts with the viewer. */
  interaction: {
    mode?: string;
    exclusive: boolean;
    cursor?: string;
    /** If true, this interaction mode is activated by selecting text. */
    textSelection?: boolean;

    /** Annotation interaction behaviors */
    isDraggable?: boolean;
    isResizable?: boolean;
    lockAspectRatio?: boolean;
  };

  /** Tool-specific behavior settings that override plugin defaults */
  behavior?: {
    /** When true, deactivate this tool after creating an annotation. Overrides plugin config. */
    deactivateToolAfterCreate?: boolean;
    /** When true, select the annotation immediately after creation. Overrides plugin config. */
    selectAfterCreate?: boolean;
  };
} & ClickBehaviorFor<T>;
