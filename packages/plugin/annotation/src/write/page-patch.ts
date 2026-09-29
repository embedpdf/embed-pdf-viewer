/**
 * A record's turn, as a geometry change: what the selection's quarter turns
 * write through `withFields`.
 */
import { PluginError } from '@embedpdf/core';
import { geomRotation, type ModelGeometry } from '@embedpdf/core-annotation';

/** The geometry turned to `rotation` degrees; text markup and carets follow their text and never turn. */
export function geometryWithRotation(geometry: ModelGeometry, rotation: number): ModelGeometry {
  if (geometry.kind === 'quads' || geometry.kind === 'caret') {
    throw new PluginError(
      'unsupported',
      'annotation',
      `'${geometry.kind}' annotations do not rotate`,
    );
  }
  return geometry.kind === 'box' ? { ...geometry, rotation } : { ...geometry, rot: rotation };
}

/** A record's rotation in degrees (0 for kinds without one). */
export const rotationOf = geomRotation;
