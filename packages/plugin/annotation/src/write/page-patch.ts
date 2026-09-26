/**
 * A page-space patch applied to a record's content geometry — the lowering
 * the public `update` verb shares with the gestures. Each helper refuses a
 * patch that does not fit the record's geometry instead of guessing.
 */
import { PluginError } from '@embedpdf/core';
import type { ContentGeometry, Rect } from '@embedpdf/core-annotation';

import type { AnnotationGeometryPatch } from '../contract';

/** The geometry with `patch` in place of its own: the same kind, or an `invalid-input` refusal. */
export function geometryWithPatch(
  geometry: ContentGeometry,
  patch: AnnotationGeometryPatch,
): ContentGeometry {
  const mismatch = (): never => {
    throw new PluginError(
      'invalid-input',
      'annotation',
      `a '${patch.kind}' geometry cannot replace a '${geometry.kind}' geometry`,
    );
  };
  switch (patch.kind) {
    case 'rect':
      return geometry.kind === 'rect'
        ? {
            ...geometry,
            rect: patch.bounds,
            ...(patch.rotation !== undefined ? { rot: patch.rotation } : {}),
          }
        : mismatch();
    case 'line':
      return geometry.kind === 'line' ? { ...geometry, a: patch.from, b: patch.to } : mismatch();
    case 'polygon':
    case 'polyline':
      return geometry.kind === 'poly'
        ? {
            ...geometry,
            points: patch.vertices.map((point) => ({ ...point })),
            closed: patch.kind === 'polygon',
          }
        : mismatch();
    case 'ink':
      return geometry.kind === 'ink'
        ? {
            ...geometry,
            strokes: patch.strokes.map((stroke) => stroke.map((point) => ({ ...point }))),
          }
        : mismatch();
    case 'markup':
      return geometry.kind === 'quads'
        ? { ...geometry, quads: patch.quads.map((quad) => ({ ...quad })) }
        : mismatch();
    case 'text':
      return geometry.kind === 'text'
        ? {
            ...geometry,
            rect: patch.bounds,
            ...(patch.rotation !== undefined ? { rot: patch.rotation } : {}),
            ...(patch.callout !== undefined ? { callout: patch.callout ?? undefined } : {}),
          }
        : mismatch();
  }
}

/** The geometry with new bounds; only box geometries have them. */
export function geometryWithBounds(geometry: ContentGeometry, bounds: Rect): ContentGeometry {
  if (geometry.kind === 'rect' || geometry.kind === 'text' || geometry.kind === 'caret')
    return { ...geometry, rect: bounds };
  throw new PluginError(
    'invalid-input',
    'annotation',
    `'${geometry.kind}' geometry has no bounds to set; patch its geometry`,
  );
}

/** The geometry turned to `rotation` degrees; text markup and carets follow their text and never turn. */
export function geometryWithRotation(geometry: ContentGeometry, rotation: number): ContentGeometry {
  if (geometry.kind === 'quads' || geometry.kind === 'caret') {
    throw new PluginError(
      'unsupported',
      'annotation',
      `'${geometry.kind}' annotations do not rotate`,
    );
  }
  return { ...geometry, rot: rotation };
}

/** A record's rotation in degrees (0 for kinds without one). */
export const rotationOf = (geometry: ContentGeometry): number =>
  'rot' in geometry ? (geometry.rot ?? 0) : 0;
