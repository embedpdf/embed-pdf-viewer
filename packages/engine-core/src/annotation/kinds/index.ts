import { z } from 'zod';

import type { AnnotationKindModule } from '../registry';
import { CaretKind } from './caret';
import { CircleKind } from './circle';
import type { FileAttachmentDraft, FileAttachmentWireDraft } from './file-attachment';
import { FileAttachmentKind } from './file-attachment';
import { FreeTextKind } from './free-text';
import { HighlightKind } from './highlight';
import { InkKind } from './ink';
import { LineKind } from './line';
import { LinkKind } from './link';
import { PolygonKind } from './polygon';
import { PolylineKind } from './polyline';
import { RedactKind } from './redact';
import { SquareKind } from './square';
import { SquigglyKind } from './squiggly';
import type { StampDraft, StampPatch, StampWireDraft, StampWirePatch } from './stamp';
import { StampKind } from './stamp';
import { StrikeoutKind } from './strikeout';
import { TextKind } from './text';
import { UnderlineKind } from './underline';
import { UnsupportedKind } from './unsupported';
import { WidgetKind } from './widget';

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
export * from './unsupported';
export * from './text-markup.shared';
export * from './shape.shared';
export * from './style.shared';
export * from './vertex.shared';

/**
 * The closed-world catalog of currently-implemented annotation kinds.
 *
 * Adding a new subtype is one folder under `kinds/<name>/` exporting the
 * five files (dto, draft, patch, schema, index) and one entry in this
 * tuple. The discriminated unions and zod discriminator below regenerate
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

type DTOFromKind<K> =
  K extends AnnotationKindModule<infer _S, infer D, infer _Dr, infer _Pa> ? D : never;
type DraftFromKind<K> =
  K extends AnnotationKindModule<infer _S, infer _D, infer Dr, infer _Pa> ? Dr : never;
type PatchFromKind<K> =
  K extends AnnotationKindModule<infer _S, infer _D, infer _Dr, infer Pa> ? Pa : never;

/** Discriminated union over `subtype`, derived from the registry. */
export type AnnotationDTO = DTOFromKind<AnnotationKind>;

/**
 * WIRE drafts/patches: pure JSON, what the worker protocol and HTTP
 * surface carry and what the Zod schemas below validate. Kind modules are
 * wire-typed, so these derive straight from the registry.
 */
export type WireAnnotationDraft = Exclude<DraftFromKind<AnnotationKind>, never>;
export type WireAnnotationPatch = Exclude<PatchFromKind<AnnotationKind>, never>;

/**
 * AUTHORING drafts/patches: what callers pass to `create()`/`update()`.
 * Identical to the wire forms except for binary-carrying kinds, whose
 * inline-`BinarySource` authoring types are swapped in here. Engines
 * bridge the two via `annotation/normalize.ts` — see that module for the
 * uniform binary rule.
 */
export type AnnotationDraft =
  | Exclude<WireAnnotationDraft, StampWireDraft | FileAttachmentWireDraft>
  | StampDraft
  | FileAttachmentDraft;
export type AnnotationPatch = Exclude<WireAnnotationPatch, StampWirePatch> | StampPatch;

/**
 * Runtime zod schema for the discriminated union. The cast unwinds the
 * generic schema map into the specific tuple form `discriminatedUnion`
 * needs. Servers and cloud clients use this to validate every annotation
 * payload on the wire.
 */
export const AnnotationDTOSchema: z.ZodType<AnnotationDTO> = z.discriminatedUnion('subtype', [
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
  UnsupportedKind.dtoSchema,
] as unknown as [
  z.ZodDiscriminatedUnionOption<'subtype'>,
  ...z.ZodDiscriminatedUnionOption<'subtype'>[],
]) as unknown as z.ZodType<AnnotationDTO>;

/**
 * Validates the WIRE draft form (post-normalization) — binary-carrying
 * kinds appear here with `{ resource }` refs, never inline bytes.
 */
export const AnnotationDraftSchema: z.ZodType<WireAnnotationDraft> = z.discriminatedUnion(
  'subtype',
  [
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
  ] as unknown as [
    z.ZodDiscriminatedUnionOption<'subtype'>,
    ...z.ZodDiscriminatedUnionOption<'subtype'>[],
  ],
) as unknown as z.ZodType<WireAnnotationDraft>;

/** Validates the WIRE patch form (post-normalization). */
export const AnnotationPatchSchema: z.ZodType<WireAnnotationPatch> = z.discriminatedUnion(
  'subtype',
  [
    HighlightKind.patchSchema,
    UnderlineKind.patchSchema,
    SquigglyKind.patchSchema,
    StrikeoutKind.patchSchema,
    CircleKind.patchSchema,
    SquareKind.patchSchema,
    PolygonKind.patchSchema,
    PolylineKind.patchSchema,
    LineKind.patchSchema,
    LinkKind.patchSchema,
    InkKind.patchSchema,
    FreeTextKind.patchSchema,
    CaretKind.patchSchema,
    TextKind.patchSchema,
    StampKind.patchSchema,
    FileAttachmentKind.patchSchema,
    WidgetKind.patchSchema,
    RedactKind.patchSchema,
  ] as unknown as [
    z.ZodDiscriminatedUnionOption<'subtype'>,
    ...z.ZodDiscriminatedUnionOption<'subtype'>[],
  ],
) as unknown as z.ZodType<WireAnnotationPatch>;
