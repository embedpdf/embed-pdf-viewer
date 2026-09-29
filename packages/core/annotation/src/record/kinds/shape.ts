/**
 * Square + circle. The model keeps a cloudy shape's outer box, its scallops
 * drawn in from it (`shapeRectFor`); the engine takes the shape's own box,
 * which the scallops start from, and works out `rect` around them. So the
 * box sent is the model box less the cloud's reach (`shapeBoxOf`), a read
 * grows the engine's box by it, and a change to the cloud or the stroke
 * width states the box again. The non-cloudy state is stated as a `null`
 * intensity (tri-state remove), never omitted.
 */
import type { AnnotationDTO } from '@embedpdf/engine-core/runtime';

import { geomRotation, shapeBoxOf, shapeRectFor } from '../../geometry';
import type { ModelAnnotation } from '../../types';
import type { KindProjection, Wire } from '../projection';
import { borderSlice } from '../props';
import { boxGeomFields, boxGeomFromDTO, styleFromDTO } from '../seam';

type ShapeDTO = Extract<AnnotationDTO, { subtype: 'square' | 'circle' }>;

/** The engine's box and turn for a rect shape: its model box less the cloud's reach. */
function shapeGeometry(annotation: ModelAnnotation): Wire | null {
  const geometry = annotation.geometry;
  if (geometry.kind !== 'rect') return null;
  const box = shapeBoxOf(geometry.rect, geometry.ellipse, annotation.style);
  return boxGeomFields(box, geomRotation(geometry));
}

/** `/BE` for a rect shape, total (`null` when plain), with the box it leaves. */
export function cloudyExtras(annotation: ModelAnnotation): Wire {
  if (annotation.geometry.kind !== 'rect') return {};
  const border = annotation.style.border;
  return {
    cloudyIntensity: border.kind === 'cloudy' ? border.intensity : null,
    ...shapeGeometry(annotation),
  };
}

const ingest = (dto: AnnotationDTO, ellipse: boolean) => {
  const geometry = boxGeomFromDTO(dto as ShapeDTO, ellipse);
  if (geometry.kind !== 'rect') return { geometry };
  return {
    geometry: { ...geometry, rect: shapeRectFor(geometry.rect, ellipse, styleFromDTO(dto)) },
  };
};

const projection = (ellipse: boolean): KindProjection => ({
  ingest: (dto) => ingest(dto, ellipse),
  geometry: shapeGeometry,
  prop: {
    // The cloud's reach follows its intensity and the stroke width, so either
    // change states the box it leaves.
    strokeWidth: (annotation) => ({
      strokeWidth: annotation.style.strokeWidth,
      ...cloudyExtras(annotation),
    }),
    border: (annotation) => ({
      ...borderSlice(annotation.style),
      ...cloudyExtras(annotation),
    }),
  },
});

export const square: KindProjection = projection(false);
export const circle: KindProjection = projection(true);
