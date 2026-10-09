import { z } from 'zod';

import type { PdfCoordinates } from '../../pageSpace/coordinates';
import { CaretKind } from './caret';
import { CircleKind } from './circle';
import { FileAttachmentKind } from './file-attachment';
import { FreeTextKind } from './free-text';
import { HighlightKind } from './highlight';
import { InkKind } from './ink';
import { LineKind } from './line';
import { LinkKind } from './link';
import { PolygonKind } from './polygon';
import { PolylineKind } from './polyline';
import { PopupKind } from './popup';
import { RedactKind } from './redact';
import { SquareKind } from './square';
import { SquigglyKind } from './squiggly';
import { StampKind } from './stamp';
import { StrikeoutKind } from './strikeout';
import { TextKind } from './text';
import { UnderlineKind } from './underline';
import { UnsupportedKind } from './unsupported';
import { WidgetKind } from './widget';
import { ANNOTATION_DECLARATIONS, declarationOf } from './declarations';
import type { Annotation, AnnotationDraft, AnnotationPatch } from './declarations';

export * from './highlight';
export * from './underline';
export * from './squiggly';
export * from './strikeout';
export * from './circle';
export * from './square';
export * from './polygon';
export * from './polyline';
export * from './line';
export * from './link';
export * from './ink';
export * from './free-text';
export * from './caret';
export * from './text';
export * from './stamp';
export * from './file-attachment';
export * from './widget';
export * from './redact';
export * from './popup';
export * from './unsupported';
export * from './text-markup.shared';
export * from './shape.shared';
export * from './style.shared';
export * from './vertex.shared';
export * from './widget.shared';
export { ANNOTATION_DECLARATIONS, declarationOf };
export type {
  AnnotationDeclaration,
  Annotation,
  AnnotationDraft,
  AnnotationPatch,
  WritableAnnotationDeclaration,
} from './declarations';

export type { CreateOf, ReadOf, UpdateOf } from '../declaration';

/**
 * The closed-world catalog of currently-implemented annotation kinds.
 *
 * Adding a new subtype is one folder under `kinds/<name>/` with its
 * `declaration.ts` and `index.ts`, and one entry in this tuple and in
 * `declarations.ts`. The discriminated unions and zod discriminator below regenerate
 * automatically; no other file in the package needs to change.
 *
 * Every subtype the engine has not yet wired up rides on
 * `UnsupportedKind`. The wire format is stable: when a per-subtype reader
 * lands later, the engine starts emitting the dedicated DTO instead of
 * `unsupported`, and existing clients widen their handling without a
 * version bump.
 */
export const ANNOTATION_KINDS = [
  HighlightKind,
  UnderlineKind,
  SquigglyKind,
  StrikeoutKind,
  CircleKind,
  SquareKind,
  PolygonKind,
  PolylineKind,
  LineKind,
  LinkKind,
  InkKind,
  FreeTextKind,
  CaretKind,
  TextKind,
  StampKind,
  FileAttachmentKind,
  WidgetKind,
  RedactKind,
  PopupKind,
  UnsupportedKind,
] as const;

export type AnnotationKind = (typeof ANNOTATION_KINDS)[number];

export type AnnotationSubtypeOfKind = AnnotationKind['subtype'];

/**
 * Lookup helper for the engine's reader catalog and identity resolver.
 * O(1) by `subtype` literal at runtime.
 */
export const KIND_BY_SUBTYPE: Readonly<{
  [K in AnnotationKind as K['subtype']]: K;
}> = Object.freeze(
  Object.fromEntries(ANNOTATION_KINDS.map((kind) => [kind.subtype, kind])) as Record<
    AnnotationSubtypeOfKind,
    AnnotationKind
  >,
) as Readonly<{ [K in AnnotationKind as K['subtype']]: K }>;

/**
 * Runtime zod schema for the discriminated union. The cast unwinds the
 * generic schema map into the specific tuple form `discriminatedUnion`
 * needs. Servers and cloud clients use this to validate every annotation
 * payload on the wire.
 */
export const AnnotationSchema: z.ZodType<Annotation> = z.discriminatedUnion('subtype', [
  HighlightKind.dtoSchema,
  UnderlineKind.dtoSchema,
  SquigglyKind.dtoSchema,
  StrikeoutKind.dtoSchema,
  CircleKind.dtoSchema,
  SquareKind.dtoSchema,
  PolygonKind.dtoSchema,
  PolylineKind.dtoSchema,
  LineKind.dtoSchema,
  LinkKind.dtoSchema,
  InkKind.dtoSchema,
  FreeTextKind.dtoSchema,
  CaretKind.dtoSchema,
  TextKind.dtoSchema,
  StampKind.dtoSchema,
  FileAttachmentKind.dtoSchema,
  WidgetKind.dtoSchema,
  RedactKind.dtoSchema,
  PopupKind.dtoSchema,
  UnsupportedKind.dtoSchema,
] as unknown as [
  z.ZodDiscriminatedUnionOption<'subtype'>,
  ...z.ZodDiscriminatedUnionOption<'subtype'>[],
]) as unknown as z.ZodType<Annotation>;

/** Validates a create's data against its kind. */
export const AnnotationDraftSchema: z.ZodType<AnnotationDraft> = z.discriminatedUnion('subtype', [
  HighlightKind.draftSchema,
  UnderlineKind.draftSchema,
  SquigglyKind.draftSchema,
  StrikeoutKind.draftSchema,
  CircleKind.draftSchema,
  SquareKind.draftSchema,
  PolygonKind.draftSchema,
  PolylineKind.draftSchema,
  LineKind.draftSchema,
  LinkKind.draftSchema,
  InkKind.draftSchema,
  FreeTextKind.draftSchema,
  CaretKind.draftSchema,
  TextKind.draftSchema,
  StampKind.draftSchema,
  FileAttachmentKind.draftSchema,
  WidgetKind.draftSchema,
  RedactKind.draftSchema,
  PopupKind.draftSchema,
] as unknown as [
  z.ZodDiscriminatedUnionOption<'subtype'>,
  ...z.ZodDiscriminatedUnionOption<'subtype'>[],
]) as unknown as z.ZodType<AnnotationDraft>;

/**
 * Validates a patch against every kind. A
 * patch may leave out its `subtype`, so this only checks that the patch fits
 * some kind; {@link annotationPatchSchemaOf} checks it against its target.
 */
export const AnnotationPatchSchema: z.ZodType<AnnotationPatch> = z.union(
  ANNOTATION_KINDS.filter((kind) => kind.subtype !== 'unsupported').map(
    (kind) => kind.patchSchema,
  ) as unknown as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]],
) as unknown as z.ZodType<AnnotationPatch>;

/** The patch schema of one kind: how an update of an annotation of that kind is checked. */
export function annotationPatchSchemaOf(
  subtype: AnnotationSubtypeOfKind,
): z.ZodType<AnnotationPatch> {
  return KIND_BY_SUBTYPE[subtype].patchSchema as unknown as z.ZodType<AnnotationPatch>;
}

/**
 * A create's data in the file's coordinates, checked against its kind: the
 * engine's own check, after the worker converted the data from page space.
 */
export const FileAnnotationDraftSchema: z.ZodType<AnnotationDraft<PdfCoordinates>> =
  z.discriminatedUnion(
    'subtype',
    ANNOTATION_DECLARATIONS.filter((declaration) => declaration.subtype !== 'unsupported').map(
      (declaration) => declaration.fileSchemas.create,
    ) as unknown as [
      z.ZodDiscriminatedUnionOption<'subtype'>,
      ...z.ZodDiscriminatedUnionOption<'subtype'>[],
    ],
  ) as unknown as z.ZodType<AnnotationDraft<PdfCoordinates>>;

/** An update's data in the file's coordinates, checked against the kind it changes. */
export function fileAnnotationPatchSchemaOf(
  subtype: AnnotationSubtypeOfKind,
): z.ZodType<AnnotationPatch<PdfCoordinates>> {
  return declarationOf(subtype)!.fileSchemas.update as unknown as z.ZodType<
    AnnotationPatch<PdfCoordinates>
  >;
}
