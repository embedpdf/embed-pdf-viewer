/**
 * Generic per-key prop lowerings — the 1:1 mappings from the flat props
 * vocabulary to wire fields that hold for every kind that declares the key.
 * Kind modules override only their exceptions (a coupling lives in its
 * owner's file: cloudy `/RD` in shape.ts, visual-bounds `/Rect` in stroke.ts,
 * the link target in link.ts).
 */
import { initialTextStyle, type ModelAnnotation, type PropKey } from '@embedpdf/core-annotation';

import type { Wire } from './projection';
import { cssToColor } from './seam';

/** /BS slice of the style — a cloudy border keeps a solid underlying stroke
 *  (the scallops are the /BE effect, layered on by the shape kinds). */
export const borderSlice = (style: ModelAnnotation['style']): Wire => ({
  borderStyle: style.border.kind === 'dashed' ? ('dashed' as const) : ('solid' as const),
  ...(style.border.kind === 'dashed' ? { dashArray: style.border.dash } : {}),
});

/** The `/DA`-styled text slice falls back to the draw-time seed exactly like
 *  the old projections did (a fresh draft may not carry `text` yet). */
const textOf = (annotation: ModelAnnotation) => annotation.text ?? initialTextStyle;

export const GENERIC_PROPS: Partial<Record<PropKey, (annotation: ModelAnnotation) => Wire>> = {
  color: (annotation) => ({ color: cssToColor(annotation.style.color) }),
  opacity: (annotation) => ({ opacity: annotation.style.opacity }),
  blendMode: (annotation) => ({ blendMode: annotation.style.blendMode }),
  interiorColor: (annotation) => ({
    interiorColor: annotation.style.interiorColor
      ? cssToColor(annotation.style.interiorColor)
      : null,
  }),
  strokeWidth: (annotation) => ({ strokeWidth: annotation.style.strokeWidth }),
  border: (annotation) => borderSlice(annotation.style),
  fontFamily: (annotation) => ({ fontFamily: textOf(annotation).fontFamily }),
  fontSize: (annotation) => ({ fontSize: textOf(annotation).fontSize }),
  fontColor: (annotation) => ({ fontColor: cssToColor(textOf(annotation).fontColor) }),
  textAlign: (annotation) => ({ textAlign: textOf(annotation).textAlign }),
  icon: (annotation) => (annotation.icon !== undefined ? { icon: annotation.icon } : {}),
  // A non-link kind's `link` prop is not wire data on the parent: it
  // materializes as attached child annotations through the syncLink
  // reconciler. The link kind overrides this with its own `/A` target.
  link: () => ({}),
};
