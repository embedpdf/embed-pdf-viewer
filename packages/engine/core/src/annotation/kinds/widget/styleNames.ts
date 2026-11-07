/** A widget's style: what `/MK`, `/BS`, `/DA` and `/Q` hold, the look its kind draws. */
export const WIDGET_STYLE_NAMES = [
  'color',
  'interiorColor',
  'strokeWidth',
  'borderStyle',
  'dashArray',
  'fontFamily',
  'fontSize',
  'fontColor',
  'textAlign',
  'caption',
  'checkStyle',
] as const;

export type WidgetStyleName = (typeof WIDGET_STYLE_NAMES)[number];
