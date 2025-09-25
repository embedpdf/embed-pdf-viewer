// packages/plugin-annotation/src/lib/patching/patch-registry.ts

import { PdfAnnotationObject, PdfAnnotationSubtype } from '@embedpdf/models';

export interface TransformContext<T extends PdfAnnotationObject = PdfAnnotationObject> {
  /** The type of transformation being applied */
  type: 'move' | 'resize' | 'vertex-edit' | 'property-update';

  /** The changes being applied - can be any properties of the annotation */
  changes: Partial<T>;

  /** Optional metadata about the transformation */
  metadata?: {
    maintainAspectRatio?: boolean;
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

    // If there's a specific patch function, use it
    if (patchFn) {
      return patchFn(annotation, context);
    }

    // Default behavior: just return the changes for simple annotations
    return context.changes;
  }
}

export const patchRegistry = new PatchRegistry();
