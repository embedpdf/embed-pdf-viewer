/**
 * Square + circle. Owns the cloudy-border physics: the `/BE` intensity, the
 * derived `/RD` inset (`cloudyBorderExtent(intensity, strokeWidth)` — client
 * policy, the engine never derives it), and the tri-state clears that remove
 * both when the border returns to plain. The `/Rect` we emit is the outer box
 * and `/RD` insets the drawn geometry so the scallops bulge back out to it —
 * derived, never stored on the model.
 */
import { cloudyBorderExtent, type ModelAnnotation } from '@embedpdf/core-annotation';
import type { AnnotationDTO, PdfRect } from '@embedpdf/engine-core/runtime';

import { boxEmit, type KindProjection, type Wire } from '../projection';
import { borderSlice } from '../props';
import { boxGeomFromDTO } from '../seam';

type ShapeDTO = Extract<AnnotationDTO, { subtype: 'square' | 'circle' }>;

/** Cloudy `/BE` + `/RD` for a rect shape — total: the non-cloudy state is
 *  stated as `null` (tri-state remove), never omitted, so toggling cloudy off
 *  removes the stale inset (the Adobe phantom-padding bug). */
export function cloudyExtras(annotation: ModelAnnotation): Wire {
  if (annotation.geometry.kind !== 'rect') return {};
  if (annotation.style.border.kind === 'cloudy') {
    const inset = cloudyBorderExtent(
      annotation.style.border.intensity,
      annotation.style.strokeWidth,
      annotation.geometry.ellipse,
    );
    return {
      cloudyIntensity: annotation.style.border.intensity,
      rectDifferences: { left: inset, top: inset, right: inset, bottom: inset },
    };
  }
  return { cloudyIntensity: null, rectDifferences: null };
}

const ingest = (dto: AnnotationDTO, crop: PdfRect, ellipse: boolean) => {
  const shapeDto = dto as ShapeDTO;
  return {
    geometry: boxGeomFromDTO(
      shapeDto,
      shapeDto.rotation ?? undefined,
      shapeDto.unrotatedRect ?? undefined,
      crop,
      ellipse,
    ),
  };
};

const projection = (ellipse: boolean): KindProjection => ({
  ingest: (dto, crop) => ingest(dto, crop, ellipse),
  geometry: (annotation, crop) => boxEmit(annotation, crop),
  prop: {
    // The inset derives from intensity × stroke width, so a width change on a
    // cloudy shape re-states the /RD it owns.
    strokeWidth: (annotation) => ({
      strokeWidth: annotation.style.strokeWidth,
      ...cloudyExtras(annotation),
    }),
    border: (annotation) => ({ ...borderSlice(annotation.style), ...cloudyExtras(annotation) }),
  },
});

export const square: KindProjection = projection(false);
export const circle: KindProjection = projection(true);
