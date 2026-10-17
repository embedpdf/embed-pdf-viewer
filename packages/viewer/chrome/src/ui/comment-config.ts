import type { Annotation, Color } from '@embedpdf/react/annotation';

/**
 * How a comment card identifies its annotation at a glance: the type's glyph,
 * tinted with that annotation's own colors. The icon names are the chrome icon
 * set's registry names and accent slots. The color model follows the spec:
 * there is exactly one `/C` ("color") and one `/IC` ("interiorColor"), so
 * `primary` is the annotation's `/C` and `secondary` its interior fill where
 * the family has one.
 */

export interface IconAccent {
  primary?: string;
  secondary?: string;
}

export interface CommentTypeConfig {
  /** Icon name in the chrome registry. */
  icon: string;
  /** i18n key for the type's display name (tooltip). */
  labelKey: string;
  /** Fallback when the locale has no entry. */
  label: string;
}

const TYPE_CONFIG: Record<string, CommentTypeConfig> = {
  text: { icon: 'message', labelKey: 'annotation.comment', label: 'Comment' },
  highlight: { icon: 'highlight', labelKey: 'annotation.highlight', label: 'Highlight' },
  underline: { icon: 'underline', labelKey: 'annotation.underline', label: 'Underline' },
  squiggly: { icon: 'squiggly', labelKey: 'annotation.squiggly', label: 'Squiggly' },
  strikeout: { icon: 'strikethrough', labelKey: 'annotation.strikeout', label: 'Strikethrough' },
  square: { icon: 'square', labelKey: 'annotation.square', label: 'Square' },
  circle: { icon: 'circle', labelKey: 'annotation.circle', label: 'Circle' },
  line: { icon: 'line', labelKey: 'annotation.line', label: 'Line' },
  polygon: { icon: 'polygon', labelKey: 'annotation.polygon', label: 'Polygon' },
  polyline: { icon: 'zigzag', labelKey: 'annotation.polyline', label: 'Polyline' },
  ink: { icon: 'pencilMarker', labelKey: 'annotation.ink', label: 'Ink' },
  'free-text': { icon: 'freeText', labelKey: 'annotation.freeText', label: 'Text' },
  stamp: { icon: 'rubberStamp', labelKey: 'annotation.stamp', label: 'Stamp' },
  caret: { icon: 'insertText', labelKey: 'annotation.caret', label: 'Caret' },
  redact: { icon: 'redact', labelKey: 'annotation.redact', label: 'Redact' },
  'file-attachment': {
    icon: 'paperclip',
    labelKey: 'annotation.fileAttachment',
    label: 'Attachment',
  },
};

const FALLBACK: CommentTypeConfig = {
  icon: 'message',
  labelKey: 'annotation.comment',
  label: 'Comment',
};

export const commentTypeConfig = (dto: Annotation): CommentTypeConfig =>
  TYPE_CONFIG[dto.subtype] ?? FALLBACK;

/**
 * The glyph's tint slots, read off the annotation itself — this is what makes
 * a card recognizable as "that yellow highlight on page 3". Free-text prefers
 * its `fontColor` override, since that is the color a reader actually sees.
 */
export const commentIconAccent = (dto: Annotation): IconAccent => {
  // Engine colors are `'#rrggbb'`, which CSS takes as they are.
  const anyA = dto as { color?: Color; interiorColor?: Color | null; fontColor?: Color };
  const primary = anyA.fontColor ?? anyA.color;
  const secondary = anyA.interiorColor ?? undefined;
  return {
    ...(primary ? { primary } : {}),
    ...(secondary ? { secondary } : {}),
  };
};
