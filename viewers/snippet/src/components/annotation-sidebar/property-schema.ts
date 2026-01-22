import { PdfAnnotationSubtype } from '@embedpdf/models';

/**
 * Configuration for a single editable property in the sidebar.
 */
export interface PropertyConfig {
  /** The property key on the annotation object */
  key: string;
  /** The type of UI control to render */
  type:
    | 'color'
    | 'colorWithTransparent'
    | 'opacity'
    | 'slider'
    | 'strokeStyle'
    | 'lineEndings'
    | 'fontFamily'
    | 'fontSize'
    | 'fontColor'
    | 'textAlign'
    | 'verticalAlign'
    | 'blendMode';
  /** Translation key for the label */
  labelKey: string;
  /** Minimum value for sliders */
  min?: number;
  /** Maximum value for sliders */
  max?: number;
  /** Step value for sliders */
  step?: number;
  /** Unit to display (e.g., 'px', '%') */
  unit?: string;
  /** Whether to debounce changes (for sliders) */
  debounce?: boolean;
}

/**
 * All available property configurations.
 * Each property has a unique identifier and its UI configuration.
 */
export const PROPERTY_CONFIGS: Record<string, PropertyConfig> = {
  // Color properties
  color: {
    key: 'color',
    type: 'colorWithTransparent',
    labelKey: 'annotation.fillColor',
  },
  strokeColor: {
    key: 'strokeColor',
    type: 'colorWithTransparent',
    labelKey: 'annotation.strokeColor',
  },

  // Common properties
  opacity: {
    key: 'opacity',
    type: 'opacity',
    labelKey: 'annotation.opacity',
    min: 0.1,
    max: 1,
    step: 0.05,
    debounce: true,
  },
  strokeWidth: {
    key: 'strokeWidth',
    type: 'slider',
    labelKey: 'annotation.strokeWidth',
    min: 1,
    max: 30,
    step: 1,
    unit: 'px',
    debounce: true,
  },
  strokeStyle: {
    key: 'strokeStyle',
    type: 'strokeStyle',
    labelKey: 'annotation.borderStyle',
  },
  lineEndings: {
    key: 'lineEndings',
    type: 'lineEndings',
    labelKey: 'annotation.lineEndings',
  },

  // FreeText font properties
  fontFamily: {
    key: 'fontFamily',
    type: 'fontFamily',
    labelKey: 'annotation.fontFamily',
  },
  fontSize: {
    key: 'fontSize',
    type: 'fontSize',
    labelKey: 'annotation.fontSize',
  },
  fontColor: {
    key: 'fontColor',
    type: 'fontColor',
    labelKey: 'annotation.fontColor',
  },
  textAlign: {
    key: 'textAlign',
    type: 'textAlign',
    labelKey: 'annotation.textAlign',
  },
  verticalAlign: {
    key: 'verticalAlign',
    type: 'verticalAlign',
    labelKey: 'annotation.verticalAlign',
  },
  blendMode: {
    key: 'blendMode',
    type: 'blendMode',
    labelKey: 'annotation.blendMode',
  },
};

/**
 * Maps annotation types to their ordered list of editable properties.
 * The order determines the display order in the sidebar.
 */
export const ANNOTATION_PROPERTIES: Partial<Record<PdfAnnotationSubtype, string[]>> = {
  // Ink uses strokeColor (was: color)
  [PdfAnnotationSubtype.INK]: ['strokeColor', 'opacity', 'strokeWidth'],

  // Shapes: color for interior fill, strokeColor for border
  [PdfAnnotationSubtype.CIRCLE]: ['color', 'opacity', 'strokeColor', 'strokeStyle', 'strokeWidth'],
  [PdfAnnotationSubtype.SQUARE]: ['color', 'opacity', 'strokeColor', 'strokeStyle', 'strokeWidth'],
  [PdfAnnotationSubtype.POLYGON]: ['strokeColor', 'opacity', 'strokeStyle', 'strokeWidth', 'color'],
  [PdfAnnotationSubtype.LINE]: [
    'strokeColor',
    'opacity',
    'strokeStyle',
    'strokeWidth',
    'lineEndings',
    'color',
  ],
  [PdfAnnotationSubtype.POLYLINE]: [
    'strokeColor',
    'opacity',
    'strokeStyle',
    'strokeWidth',
    'lineEndings',
    'color',
  ],

  // Text markup uses strokeColor (was: color) - the color of the markup stroke
  [PdfAnnotationSubtype.HIGHLIGHT]: ['strokeColor', 'opacity', 'blendMode'],
  [PdfAnnotationSubtype.UNDERLINE]: ['strokeColor', 'opacity', 'blendMode'],
  [PdfAnnotationSubtype.STRIKEOUT]: ['strokeColor', 'opacity', 'blendMode'],
  [PdfAnnotationSubtype.SQUIGGLY]: ['strokeColor', 'opacity', 'blendMode'],

  // FreeText: color for fill (was: backgroundColor), plus font properties
  [PdfAnnotationSubtype.FREETEXT]: [
    'fontFamily',
    'fontSize',
    'fontColor',
    'textAlign',
    'verticalAlign',
    'opacity',
    'color',
  ],
};

/**
 * Computes the intersection of editable properties for the given annotation types.
 * Returns properties in the order they appear in the first type's property list.
 *
 * @param types - Array of annotation subtypes to compute intersection for
 * @returns Array of property keys that are shared by ALL given types
 */
export function getSharedProperties(types: PdfAnnotationSubtype[]): string[] {
  if (types.length === 0) return [];

  const sets = types.map((t) => new Set(ANNOTATION_PROPERTIES[t] ?? []));
  const first = sets[0];

  // Remove properties not present in all sets
  for (let i = 1; i < sets.length; i++) {
    for (const p of first) {
      if (!sets[i].has(p)) first.delete(p);
    }
  }

  // Return in order of first type's properties
  return (ANNOTATION_PROPERTIES[types[0]] ?? []).filter((p) => first.has(p));
}
