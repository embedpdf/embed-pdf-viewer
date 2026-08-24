import { z } from 'zod';

import type { PdfQuad } from '../../geometry/primitives';
import { PdfQuadSchema } from '../../geometry/schemas';
import type { AnnotationBase } from '../base';
import { AnnotationBaseShape } from '../base.schema';
import {
  ColorStyleDTOShape,
  ColorStyleDraftShape,
  ColorStylePatchShape,
  type ColorStyleDraftFields,
  type ColorStyleFields,
  type ColorStylePatchFields,
} from './style.shared';

/**
 * Text-markup family-specific fields. The four text-markup subtypes
 * (highlight/underline/squiggly/strikeout) share their wire shape per
 * ISO 32000 12.5.6.10: the universal {@link ColorStyleFields} (`/C` color +
 * `/CA` opacity) plus one or more `quadPoints` quads.
 *
 * This file ONLY carries fields that are unique to the text-markup
 * family. Annotation-wide author-metadata (`contents`, `author`, `nm`)
 * lives on `AnnotationDraftBase` / `AnnotationPatchBase`. Each kind's
 * draft/patch type composes the two: family fields + base fields +
 * own `subtype` literal.
 */
export interface TextMarkupAnnotationFields extends ColorStyleFields {
  quadPoints: PdfQuad[];
}

export interface TextMarkupDraftFields extends ColorStyleDraftFields {
  quadPoints: PdfQuad[];
}

export interface TextMarkupPatchFields extends ColorStylePatchFields {
  quadPoints?: PdfQuad[];
}

export const TextMarkupDTOShape = {
  ...AnnotationBaseShape,
  ...ColorStyleDTOShape,
  quadPoints: z.array(PdfQuadSchema),
} as const;

export const TextMarkupDraftShape = {
  ...ColorStyleDraftShape,
  quadPoints: z.array(PdfQuadSchema),
} as const;

export const TextMarkupPatchShape = {
  ...ColorStylePatchShape,
  quadPoints: z.array(PdfQuadSchema).optional(),
} as const;

/** Glue type used by each kind file to construct its concrete DTO. */
export type TextMarkupDTO<S extends string> = AnnotationBase & {
  subtype: S;
} & TextMarkupAnnotationFields;
