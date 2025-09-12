import { PdfAnnotationObject, PdfAnnotationSubtype } from '@embedpdf/models';

/**
 * Specific configuration for Stamp tools.
 */
export interface StampToolConfig {
  /** The base64 or URL source for the stamp's image. */
  imageSrc?: string;
}

/**
 * A central, extensible map that associates an annotation subtype
 * with its unique tool configuration interface.
 */
export interface ToolConfigMap {
  [PdfAnnotationSubtype.STAMP]: StampToolConfig;
}

// This helper type looks up the config for a given annotation type T.
// If it finds a config in ToolConfigMap, it returns it; otherwise, it returns an empty object {}.
type GetToolConfig<T extends PdfAnnotationObject> = T['type'] extends keyof ToolConfigMap
  ? ToolConfigMap[T['type']]
  : {};

/**
 * The primary interface for defining an annotation tool.
 */
export interface AnnotationTool<T extends PdfAnnotationObject = PdfAnnotationObject> {
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
    mode: string;
    exclusive: boolean;
    cursor?: string;
    /** If true, this interaction mode is activated by selecting text. */
    textSelection?: boolean;
  };
}
