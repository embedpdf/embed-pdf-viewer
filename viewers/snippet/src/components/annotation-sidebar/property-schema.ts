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
    | 'blendMode'
    | 'text'
    | 'rotation';
  /** Translation key for the label */
  labelKey: string;
  /** Translation key for the placeholder (optional, for text inputs) */
  placeholderKey?: string;
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
  /** If true, only show this property when editing an existing annotation (not for tool defaults) */
  editOnly?: boolean;
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

  // Font properties
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

  // Rotation
  rotation: {
    key: 'rotation',
    type: 'rotation',
    labelKey: 'annotation.rotation',
    debounce: true,
    editOnly: true,
  },

  // Redact properties
  overlayText: {
    key: 'overlayText',
    type: 'text',
    labelKey: 'annotation.overlayText',
    placeholderKey: 'annotation.overlayTextPlaceholder',
  },
};

/**
 * Maps tool IDs to their ordered list of editable properties.
 * The order determines the display order in the sidebar.
 *
 * Keyed by tool ID (matching AnnotationTool.id) rather than annotation subtype,
 * so tools sharing the same subtype (e.g. ink vs inkHighlighter, line vs lineArrow,
 * or different widget field types) can define distinct property lists.
 */
export const TOOL_PROPERTIES: Record<string, string[]> = {
  // Text markup
  highlight: ['strokeColor', 'opacity', 'blendMode'],
  underline: ['strokeColor', 'opacity', 'blendMode'],
  strikeout: ['strokeColor', 'opacity', 'blendMode'],
  squiggly: ['strokeColor', 'opacity', 'blendMode'],

  // Ink (distinct from inkHighlighter which adds blendMode)
  ink: ['strokeColor', 'opacity', 'strokeWidth', 'rotation'],
  inkHighlighter: ['strokeColor', 'opacity', 'strokeWidth', 'blendMode', 'rotation'],

  // Shapes
  circle: ['color', 'opacity', 'strokeColor', 'strokeStyle', 'strokeWidth', 'rotation'],
  square: ['color', 'opacity', 'strokeColor', 'strokeStyle', 'strokeWidth', 'rotation'],
  polygon: ['strokeColor', 'opacity', 'strokeStyle', 'strokeWidth', 'color', 'rotation'],
  line: [
    'strokeColor',
    'opacity',
    'strokeStyle',
    'strokeWidth',
    'lineEndings',
    'color',
    'rotation',
  ],
  lineArrow: [
    'strokeColor',
    'opacity',
    'strokeStyle',
    'strokeWidth',
    'lineEndings',
    'color',
    'rotation',
  ],
  polyline: [
    'strokeColor',
    'opacity',
    'strokeStyle',
    'strokeWidth',
    'lineEndings',
    'color',
    'rotation',
  ],

  // Text annotations
  textComment: ['strokeColor', 'opacity'],
  insertText: ['strokeColor', 'opacity'],
  replaceText: ['strokeColor', 'opacity'],
  freeText: [
    'fontFamily',
    'fontSize',
    'fontColor',
    'textAlign',
    'verticalAlign',
    'opacity',
    'color',
    'rotation',
  ],

  // Stamp
  stamp: ['rotation'],

  // Redact
  redact: ['strokeColor', 'color', 'opacity'],

  // Form widgets
  formTextField: ['fontSize', 'fontColor', 'strokeColor', 'color', 'strokeWidth'],
  formCheckbox: ['strokeColor', 'color', 'strokeWidth'],
};

/**
 * Computes the intersection of editable properties for the given tool IDs.
 * Returns properties in the order they appear in the first tool's property list.
 *
 * @param toolIds - Array of tool IDs to compute intersection for
 * @returns Array of property keys that are shared by ALL given tools
 */
export function getSharedProperties(toolIds: string[]): string[] {
  if (toolIds.length === 0) return [];

  const unique = [...new Set(toolIds)];
  const sets = unique.map((id) => new Set(TOOL_PROPERTIES[id] ?? []));
  const first = sets[0];

  for (let i = 1; i < sets.length; i++) {
    for (const p of first) {
      if (!sets[i].has(p)) first.delete(p);
    }
  }

  return (TOOL_PROPERTIES[unique[0]] ?? []).filter((p) => first.has(p));
}
