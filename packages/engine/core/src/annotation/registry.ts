import type { z } from 'zod';

import type { AnnotationBase } from './base';
import type { AnnotationSubtype } from './subtype';

/**
 * One module per PDF annotation subtype. A kind module is the single source
 * of truth for that subtype: DTO type, draft type, patch type, and the zod
 * schemas for each. The catalog union types and runtime schemas are derived
 * from `AnnotationKinds` so adding a subtype is one folder, never a
 * type-system refactor.
 */
export interface AnnotationKindModule<
  S extends AnnotationSubtype,
  DTO extends AnnotationBase & { subtype: S },
  Draft,
  Patch,
> {
  readonly subtype: S;
  /**
   * The PDFium subtype code(s) this module handles. Most kinds claim a single
   * code; text-markup kinds map a single PDFium code each (HIGHLIGHT,
   * UNDERLINE, SQUIGGLY, STRIKEOUT) but share an internal reader.
   */
  readonly pdfSubtypeCode: number;
  readonly dtoSchema: z.ZodType<DTO>;
  readonly draftSchema: z.ZodType<Draft>;
  readonly patchSchema: z.ZodType<Patch>;
}

/**
 * Helper that infers the DTO type from an `AnnotationKindModule`.
 */
export type DTOOfKind<K> =
  K extends AnnotationKindModule<infer _S, infer D, infer _Dr, infer _Pa> ? D : never;

export type DraftOfKind<K> =
  K extends AnnotationKindModule<infer _S, infer _D, infer Dr, infer _Pa> ? Dr : never;

export type PatchOfKind<K> =
  K extends AnnotationKindModule<infer _S, infer _D, infer _Dr, infer Pa> ? Pa : never;
