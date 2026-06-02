import {
  MeasurableAnnotation,
  measurePagePtValue,
  PdfAnnotationObject,
  PdfAnnotationSubtype,
} from '@embedpdf/models';

export interface TransformContext<T extends PdfAnnotationObject = PdfAnnotationObject> {
  /** The type of transformation being applied */
  type: 'move' | 'resize' | 'vertex-edit' | 'rotate' | 'property-update';

  /** The changes being applied - can be any properties of the annotation */
  changes: Partial<T>;

  /** Optional metadata about the transformation */
  metadata?: {
    maintainAspectRatio?: boolean;
    /** Rotation angle in degrees (for 'rotate' transform type) */
    rotationAngle?: number;
    /** Delta from the initial rotation angle in degrees */
    rotationDelta?: number;
    /** Center point for rotation (defaults to rect center) */
    rotationCenter?: { x: number; y: number };
    /** Whether the rotation input is currently snapped */
    isSnapped?: boolean;
    /** Snap target angle when isSnapped is true */
    snappedAngle?: number;
    [key: string]: any;
  };
}

export type PatchFunction<T extends PdfAnnotationObject> = (
  original: T,
  context: TransformContext<T>,
) => Partial<T>;

/**
 * Registry for annotation-specific patch functions.
 * Each patch function knows how to transform its annotation type.
 */
export class PatchRegistry {
  private patches = new Map<PdfAnnotationSubtype, PatchFunction<any>>();

  register<T extends PdfAnnotationObject>(type: PdfAnnotationSubtype, patchFn: PatchFunction<T>) {
    this.patches.set(type, patchFn);
  }

  /**
   * Transform an annotation based on the context.
   * Returns the transformed properties or just the changes if no patch function exists.
   */
  transform<T extends PdfAnnotationObject>(
    annotation: T,
    context: TransformContext<T>,
  ): Partial<T> {
    const patchFn = this.patches.get(annotation.type);

    // Use the type-specific patch if present, otherwise the raw changes.
    const changes: Partial<T> = patchFn ? patchFn(annotation, context) : context.changes;

    return this.refreshMeasurement(annotation, changes);
  }

  /**
   * Keep a measurement annotation's cached `computedValue` in sync after any
   * transform. Recomputes from the merged annotation so it reflects both
   * geometry edits (vertex-edit/move/resize/rotate) and calibration changes
   * (unit/scale property-updates). No-op for non-measurement annotations.
   */
  private refreshMeasurement<T extends PdfAnnotationObject>(
    annotation: T,
    changes: Partial<T>,
  ): Partial<T> {
    const measurement = (annotation as { measurement?: unknown }).measurement;
    const changedMeasurement = (changes as { measurement?: unknown }).measurement;
    if (!measurement && !changedMeasurement) return changes;

    const merged = { ...annotation, ...changes } as MeasurableAnnotation;
    if (!merged.measurement) return changes;

    return {
      ...changes,
      measurement: { ...merged.measurement, computedValue: measurePagePtValue(merged) },
    } as Partial<T>;
  }
}

export const patchRegistry = new PatchRegistry();
