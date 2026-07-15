import { z } from 'zod';

import type { AnnotationBase } from './base';
import type {
  AnnotationBorderStyle,
  AnnotationFlags,
  BlendMode,
  CaretIntent,
  Color,
  FreeTextIntent,
  InkIntent,
  LineEnding,
  LineEndings,
  PdfRectDifferences,
  StandardFont,
  StrikeoutIntent,
  TextAlignment,
} from './primitives';
import { PdfPointSchema, PdfRectSchema, PdfQuadSchema } from '../geometry/schemas';
import type { AnnotationRef } from '../identity/AnnotationRef';
import type { AnnotationStableId } from '../identity/AnnotationStableId';
import type { RevisionToken } from '../revision/RevisionToken';
import { PdfAnnotationActionsSchema } from '../dto/PdfAction.schema';

/** @deprecated Use `PdfPointSchema` from `../geometry/schemas`. */
export const PointSchema = PdfPointSchema;
/** @deprecated Use `PdfRectSchema` from `../geometry/schemas`. */
export const RectSchema = PdfRectSchema;

export const ColorSchema: z.ZodType<Color> = z.object({
  r: z.number().int().min(0).max(255),
  g: z.number().int().min(0).max(255),
  b: z.number().int().min(0).max(255),
});

export const AnnotationBorderStyleSchema: z.ZodType<AnnotationBorderStyle> = z.enum([
  'solid',
  'dashed',
  'beveled',
  'inset',
]);

export const PdfRectDifferencesSchema: z.ZodType<PdfRectDifferences> = z.object({
  left: z.number().nonnegative(),
  top: z.number().nonnegative(),
  right: z.number().nonnegative(),
  bottom: z.number().nonnegative(),
});

export const LineEndingSchema: z.ZodType<LineEnding> = z.enum([
  'none',
  'square',
  'circle',
  'diamond',
  'open-arrow',
  'closed-arrow',
  'butt',
  'r-open-arrow',
  'r-closed-arrow',
  'slash',
]);

export const LineEndingsSchema: z.ZodType<LineEndings> = z.object({
  start: LineEndingSchema,
  end: LineEndingSchema,
});

export const StandardFontSchema: z.ZodType<StandardFont> = z.enum([
  'courier',
  'courier-bold',
  'courier-bold-oblique',
  'courier-oblique',
  'helvetica',
  'helvetica-bold',
  'helvetica-bold-oblique',
  'helvetica-oblique',
  'times-roman',
  'times-bold',
  'times-bold-italic',
  'times-italic',
  'symbol',
  'zapf-dingbats',
]);

export const TextAlignmentSchema: z.ZodType<TextAlignment> = z.enum(['left', 'center', 'right']);

export const FreeTextIntentSchema: z.ZodType<FreeTextIntent> = z.enum([
  'free-text',
  'free-text-callout',
]);

export const CaretIntentSchema: z.ZodType<CaretIntent> = z.literal('replace');

export const StrikeoutIntentSchema: z.ZodType<StrikeoutIntent> = z.literal('strikeout-text-edit');

export const InkIntentSchema: z.ZodType<InkIntent> = z.literal('ink-highlight');

export const BlendModeSchema: z.ZodType<BlendMode> = z.enum([
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
  'hue',
  'saturation',
  'color',
  'luminosity',
]);

export const AnnotationFlagsSchema: z.ZodType<AnnotationFlags> = z.object({
  invisible: z.boolean(),
  hidden: z.boolean(),
  print: z.boolean(),
  noZoom: z.boolean(),
  noRotate: z.boolean(),
  noView: z.boolean(),
  readOnly: z.boolean(),
  locked: z.boolean(),
  toggleNoView: z.boolean(),
  lockedContents: z.boolean(),
});

/**
 * Partial flag set authorable on a Draft or Patch — every key optional so
 * callers set only the bits they care about. The engine merges these onto
 * the annotation's current `/F` bitset.
 */
export const AnnotationFlagsPartialSchema: z.ZodType<Partial<AnnotationFlags>> = z
  .object({
    invisible: z.boolean(),
    hidden: z.boolean(),
    print: z.boolean(),
    noZoom: z.boolean(),
    noRotate: z.boolean(),
    noView: z.boolean(),
    readOnly: z.boolean(),
    locked: z.boolean(),
    toggleNoView: z.boolean(),
    lockedContents: z.boolean(),
  })
  .partial();

export const AnnotationStableIdSchema: z.ZodType<AnnotationStableId> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('objectNumber'), value: z.number().int().nonnegative() }),
    z.object({ kind: z.literal('nm'), value: z.string() }),
  ],
);

export const RevisionTokenSchema: z.ZodType<RevisionToken> = z.object({
  docSessionId: z.string(),
  pageObjectNumber: z.number().int().positive(),
  generation: z.number().int().nonnegative(),
});

export const AnnotationRefSchema: z.ZodType<AnnotationRef> = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('objectNumber'),
    pageObjectNumber: z.number().int().positive(),
    annotObjectNumber: z.number().int().positive(),
  }),
  z.object({
    kind: z.literal('nm'),
    pageObjectNumber: z.number().int().positive(),
    nm: z.string(),
  }),
  z.object({
    kind: z.literal('index'),
    pageObjectNumber: z.number().int().positive(),
    index: z.number().int().nonnegative(),
    revision: RevisionTokenSchema,
  }),
]);

/**
 * Shared object literal for every per-subtype DTO schema. Each kind's
 * `dto.schema.ts` extends this with its own `subtype` literal and
 * subtype-specific fields. Note that we do NOT include `subtype` here —
 * each kind sets its own literal so `z.discriminatedUnion('subtype', ...)`
 * works at the catalog level.
 */
export const AnnotationBaseShape = {
  ref: AnnotationRefSchema,
  pageObjectNumber: z.number().int().positive(),
  index: z.number().int().nonnegative(),
  identityQuality: z.enum(['durable', 'weak']),
  nm: z.string().nullable(),
  flags: AnnotationFlagsSchema,
  rect: PdfRectSchema,
  contents: z.string().nullable(),
  author: z.string().nullable(),
  created: z.string().datetime().nullable(),
  modified: z.string().datetime().nullable(),
  blendMode: BlendModeSchema,
  // /IRT resolved to the parent's ref + /RT. null exactly when top-level.
  inReplyTo: AnnotationRefSchema.nullable(),
  replyType: z.enum(['reply', 'group']).nullable(),
  // EmbedPDF /EMBD_Metadata fields — see AnnotationBase docstring.
  // Optional (absent for legacy or anonymous annotations) and never
  // null on the wire: present-as-string or absent entirely.
  userId: z.string().optional(),
  groupId: z.string().optional(),
  createdBy: z.string().optional(),
  updatedBy: z.string().optional(),
  actions: PdfAnnotationActionsSchema.optional(),
} as const;

/**
 * Annotation-wide fields shared by every Draft. Per-kind draft schemas
 * spread this alongside their family-specific shape.
 *
 * Authorial identity (/T, /EMBD_Metadata UserID/GroupID) is set by the
 * server from the caller's JWT identity — see the AnnotationDraftBase
 * docstring.
 */
export const AnnotationDraftBaseShape = {
  contents: z.string().nullable().optional(),
  blendMode: BlendModeSchema.optional(),
  nm: z.string().optional(),
  flags: AnnotationFlagsPartialSchema.optional(),
  inReplyTo: AnnotationRefSchema.optional(),
  replyType: z.enum(['reply', 'group']).optional(),
} as const;

/**
 * Annotation-wide fields shared by every Patch. `nm` is monotonic per
 * annotation; clients target an existing annotation via AnnotationRef
 * instead of renaming.
 *
 * `groupId` is the only identity-shaped field on a patch — it
 * represents organizational ownership, and reassignment runs through
 * `checkSetGroup`. See AnnotationPatchBase for the full immutability
 * rules.
 */
export const AnnotationPatchBaseShape = {
  contents: z.string().nullable().optional(),
  blendMode: BlendModeSchema.optional(),
  groupId: z.string().min(1).optional(),
  flags: AnnotationFlagsPartialSchema.optional(),
  // Three-state: undefined=leave, null=clear /IRT (+/RT), ref=set/relink.
  inReplyTo: AnnotationRefSchema.nullable().optional(),
  replyType: z.enum(['reply', 'group']).optional(),
} as const;

/** Helper that asserts `BasePart extends AnnotationBase` without subtype. */
export type AnnotationBaseSansSubtype = Omit<AnnotationBase, 'subtype' | 'ref'> & {
  ref: AnnotationRef;
};
