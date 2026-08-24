/**
 * GENERIC per-key prop lowerings — the 1:1 mappings from the flat props
 * vocabulary to wire fields that hold for every kind that declares the key.
 * Kind modules override ONLY their exceptions (a coupling lives in its
 * owner's file: cloudy `/RD` in shape.ts, visual-bounds `/Rect` in stroke.ts,
 * the link target in link.ts).
 */
import { initialTextStyle, type Annot, type PropKey } from '@embedpdf/core-annotation';

import type { Wire } from './projection';
import { cssToColor } from './seam';

/** /BS slice of the style — a cloudy border keeps a solid underlying stroke
 *  (the scallops are the /BE effect, layered on by the shape kinds). */
export const borderSlice = (style: Annot['style']): Wire => ({
  borderStyle: style.border.kind === 'dashed' ? ('dashed' as const) : ('solid' as const),
  ...(style.border.kind === 'dashed' ? { dashArray: style.border.dash } : {}),
});

/** The `/DA`-styled text slice falls back to the draw-time seed exactly like
 *  the old projections did (a fresh draft may not carry `text` yet). */
const textOf = (a: Annot) => a.text ?? initialTextStyle;

export const GENERIC_PROPS: Partial<Record<PropKey, (a: Annot) => Wire>> = {
  color: (a) => ({ color: cssToColor(a.style.color) }),
  opacity: (a) => ({ opacity: a.style.opacity }),
  blendMode: (a) => ({ blendMode: a.style.blendMode }),
  interiorColor: (a) => ({
    interiorColor: a.style.interiorColor ? cssToColor(a.style.interiorColor) : null,
  }),
  strokeWidth: (a) => ({ strokeWidth: a.style.strokeWidth }),
  border: (a) => borderSlice(a.style),
  fontFamily: (a) => ({ fontFamily: textOf(a).fontFamily }),
  fontSize: (a) => ({ fontSize: textOf(a).fontSize }),
  fontColor: (a) => ({ fontColor: cssToColor(textOf(a).fontColor) }),
  textAlign: (a) => ({ textAlign: textOf(a).textAlign }),
  icon: (a) => (a.icon !== undefined ? { icon: a.icon } : {}),
  // TOTAL, like the cloudy tri-state: a non-measurement states `null` so
  // demoting one back to an ordinary shape actually clears the stored
  // calibration (omission would preserve it).
  measurement: (a) => ({ measurement: a.measure ?? null }),
  // A non-link kind's `link` prop is NOT wire data on the parent: it
  // materializes as attached child annotations through the syncLink
  // reconciler. The link KIND overrides this with its own `/A` target.
  link: () => ({}),
};
