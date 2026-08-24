/**
 * Square + circle. Owns the cloudy-border physics: the `/BE` intensity, the
 * derived `/RD` inset (`cloudyBorderExtent(intensity, strokeWidth)` — client
 * policy, the engine never derives it), and the tri-state clears that remove
 * both when the border returns to plain. The `/Rect` we emit is the OUTER box
 * and `/RD` insets the drawn geometry so the scallops bulge back out to it —
 * derived, never stored on the model.
 */
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';
import { cloudyBorderExtent, type Annot } from '@embedpdf/core-annotation';

import { boxEmit, type KindProjection, type Wire } from '../projection';
import { borderSlice } from '../props';
import { boxGeomFromDTO } from '../seam';

type ShapeDTO = Extract<AnnotationDTO, { subtype: 'square' | 'circle' }>;

/** Cloudy `/BE` + `/RD` for a rect shape — TOTAL: the non-cloudy state is
 *  stated as `null` (tri-state remove), never omitted, so toggling cloudy OFF
 *  removes the stale inset (the Adobe phantom-padding bug). */
export function cloudyExtras(a: Annot): Wire {
  if (a.geom.t !== 'rect') return {};
  if (a.style.border.kind === 'cloudy') {
    const inset = cloudyBorderExtent(a.style.border.intensity, a.style.strokeWidth, a.geom.ellipse);
    return {
      cloudyIntensity: a.style.border.intensity,
      rectDifferences: { left: inset, top: inset, right: inset, bottom: inset },
    };
  }
  return { cloudyIntensity: null, rectDifferences: null };
}

const ingest = (dto: AnnotationDTO, crop: PdfRect, ellipse: boolean) => {
  const d = dto as ShapeDTO;
  return {
    geom: boxGeomFromDTO(d, d.rotation, d.unrotatedRect, crop, ellipse),
    ...(d.measurement ? { measure: d.measurement } : {}),
  };
};

const projection = (ellipse: boolean): KindProjection => ({
  ingest: (dto, crop) => ingest(dto, crop, ellipse),
  geometry: (a, crop) => boxEmit(a, crop),
  prop: {
    // The inset derives from intensity × stroke width, so a width change on a
    // cloudy shape re-states the /RD it owns.
    strokeWidth: (a) => ({ strokeWidth: a.style.strokeWidth, ...cloudyExtras(a) }),
    border: (a) => ({ ...borderSlice(a.style), ...cloudyExtras(a) }),
  },
});

export const square: KindProjection = projection(false);
export const circle: KindProjection = projection(true);
