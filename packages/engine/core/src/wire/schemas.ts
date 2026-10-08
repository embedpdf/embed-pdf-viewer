import type { Identity } from '../auth/scope/types';
import { PageRefSchema } from '../identity/PageRef.schema';
import type { PageRef } from '../identity/PageRef';
import { z } from 'zod';

import { DateInputSchema, IsoDateTimeSchema } from '../dto/IsoDateTime.schema';

import type { AnnotationList } from '../annotation/AnnotationList';
import { AnnotationRefSchema } from '../annotation/base.schema';
import {
  AnnotationDraftSchema,
  AnnotationPatchSchema,
  AnnotationSchema,
  PdfLinkTargetSchema,
  PdfLinkTargetWritableSchema,
} from '../annotation/kinds';
import { WidgetDTOSchema, WidgetPatchSchema } from '../annotation/kinds/widget';
import {
  ANNOTATION_APPEARANCE_MODES,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceBatch,
  type AnnotationAppearanceMode,
  type AnnotationAppearancesQuery,
  type WidgetAppearancesQuery,
} from '../dto/AnnotationRender';
import { AttachmentRefSchema, AttachmentSchema } from '../dto/Attachment.schema';
import {
  AppearanceResourceKeysSchema,
  ImageResourceKeysSchema,
  SourceResourceKeysSchema,
} from './resourceKeys';
import type { CachePins } from '../dto/CachePins';
import type { DocumentManifest, ManifestPage } from '../dto/DocumentManifest';
import type { LayerScopes } from '../dto/LayerScopes';
import type { CustomMetadata } from '../dto/CustomMetadata';
import type { CustomMetadataPatch } from '../dto/CustomMetadataPatch';
import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { AnalyzeInput, ChangeAnalysis } from '../signature/analysis/types';
import type {
  BaseVersionInfo,
  DocumentProtection,
  DocumentVersionRef,
  FieldLockSpec,
  PdfRevision,
  SignatureCancelResult,
  SignatureCompleteResult,
  SignatureDTO,
  SignaturePrepared,
  SignatureSeedValue,
  SignatureSnapshot,
} from '../signature/types';
import type { PageGeometryRun, PageGeometrySnapshot } from '../dto/PageGeometrySnapshot';
import { charMapViolation } from '../text/charmap';
import type { PageBoxes, PageLayout } from '../dto/PageLayout';
import type { PageListSnapshot } from '../dto/PageListSnapshot';
import type { NamedPageEntry } from '../dto/NamedPage';
import type { PageImageOptions, PageNetworkRenderFormat, PageRenderQuery } from '../dto/PageRender';
import type { PageTextSnapshot } from '../dto/PageTextSnapshot';
import { PdfPageActionsSchema } from '../dto/PdfAction.schema';
import type { PdfSaveMode } from '../dto/PdfSaveMode';
import type { DocumentSecurityState, PdfPermissionInfo } from '../engine/DocumentSecurityService';
import type { SerializedEngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';
import type { FormEffectsResult, FormEffect } from '../forms/effects';
import {
  FormFieldDraftSchema,
  FormFieldDTOSchema,
  FormFieldPatchSchema,
  FormFieldWidgetSchema,
  FormWidgetSchema,
  WidgetPlacementSchema,
} from '../forms/schema';
import { FormFieldRefSchema, FormFieldValueSchema } from '../forms/schema';
import {
  PageBoxSchema,
  PageQuadSchema,
  PdfQuadSchema,
  PdfRectSchema,
  PdfRotationSchema,
  PdfSizeSchema,
} from '../geometry/schemas';
import type { AppearanceOutcome } from '../annotation/appearance';
import type { AnnotationListMutationMeta } from '../mutation/AnnotationListMutationMeta';
import type {
  AnnotationCreateResult,
  AnnotationDeleteResult,
  AnnotationReorderResult,
  AnnotationUpdateResult,
} from '../mutation/AnnotationMutationResults';
import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
  AttachmentMutationMeta,
} from '../mutation/AttachmentMutationResults';
import type { AttachmentList } from '../dto/Attachment';
import type {
  FormFieldCreateResult,
  FormCalculationsReorderResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormRepairResult,
  FormMutationMeta,
  FormResetResult,
  FormSetValueResult,
  FormWidgetDeleteResult,
  FormWidgetLinkResult,
  FormWidgetRestoreResult,
  FormWidgetsReorderResult,
  FormWidgetUpdateResult,
} from '../mutation/FormMutationResults';
import type { CustomMetadataUpdateResult } from '../mutation/CustomMetadataUpdateResult';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { CacheDelta, MutationMeta } from '../mutation/MutationMeta';
import type { PageDeleteInput } from '../mutation/PageDeleteInput';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import { PAGE_INSERT_BLANK_MAX_COUNT } from '../mutation/PageInsertBlankInput';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageFlattenInput, PageFlattenResult } from '../mutation/PageFlattenResult';
import type { RedactionApplyResult, RedactionApplyScope } from '../mutation/RedactionApplyResult';
import type { ListPosition } from '../mutation/ListPosition';
import type { PageReorderInput } from '../mutation/PageReorderInput';
import type { PageReorderResult } from '../mutation/PageReorderResult';
import type {
  AnnotationAppearanceExportInput,
  AnnotationFlattenInput,
  AnnotationFlattenResult,
} from '../mutation/AnnotationFlattenResult';
import type { PageNameInput, PageRemoveNameInput } from '../mutation/PageNameInput';
import type { PageNameResult } from '../mutation/PageNameResult';
import type { PageRotateInput } from '../mutation/PageRotateInput';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type {
  AnnotationImportBody,
  AnnotationImportOptions,
  AnnotationImportResult,
} from '../transfer/annotationImport';
import type { FormExportSelection } from '../transfer/formExport';
import type {
  FormImportBody,
  FormImportOptions,
  FormImportResult,
  FormValuesImportBody,
  FormValuesImportOptions,
  FormValuesImportResult,
} from '../transfer/formImport';
import type { AnnotationExportSelection } from '../transfer/exportSelection';
import { fromBase64, toBase64 } from '../resource/base64';
import type {
  SearchMatch,
  SearchQuery,
  SearchRequest,
  SearchSlice,
  SearchSnippet,
} from '../search/types';
import type { PdfTextSegment } from '../text/layout';
export type { CacheDelta, MutationMeta } from '../mutation/MutationMeta';

/** Who a session acts for; see `Identity` in `auth/scope/types.ts`. */
export const IdentitySchema: z.ZodType<Identity> = z
  .object({
    userId: z.string().min(1).max(256).optional(),
    displayName: z.string().min(1).max(256).optional(),
    email: z.string().min(1).max(256).optional(),
    title: z.string().min(1).max(256).optional(),
    organization: z.string().min(1).max(256).optional(),
    organizationalUnit: z.string().min(1).max(256).optional(),
    groupId: z.string().min(1).max(256).optional(),
    groups: z.array(z.string().min(1).max(256)).max(64).optional(),
  })
  .strict();

export const DocumentMetadataSchema: z.ZodType<DocumentMetadata> = z.object({
  title: z.string().nullable(),
  author: z.string().nullable(),
  subject: z.string().nullable(),
  keywords: z.string().nullable(),
  producer: z.string().nullable(),
  creator: z.string().nullable(),
  createdAt: IsoDateTimeSchema.nullable(),
  modifiedAt: IsoDateTimeSchema.nullable(),
  trapped: z.enum(['true', 'false', 'unknown']),
});

/**
 * Three-state metadata patch. Mirrors annotation patch semantics:
 * `undefined` leaves a field, `null` clears it, a value sets it.
 */
export const MetadataPatchSchema: z.ZodType<MetadataPatch> = z
  .object({
    title: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    keywords: z.string().nullable().optional(),
    producer: z.string().nullable().optional(),
    creator: z.string().nullable().optional(),
    createdAt: DateInputSchema.nullable().optional(),
    modifiedAt: DateInputSchema.nullable().optional(),
    trapped: z.enum(['true', 'false', 'unknown']).optional(),
  })
  .strict();

/** The Info dict's other keys, `{ key: value }`. */
export const CustomMetadataSchema: z.ZodType<CustomMetadata> = z.record(z.string(), z.string());

/**
 * A custom-key patch: every key is a field (string sets, `null` removes, left
 * out stays). Which keys a PDF can hold is the engine's check, so a refusal
 * names the key the same way on both engines.
 */
export const CustomMetadataPatchSchema: z.ZodType<CustomMetadataPatch> = z.record(
  z.string(),
  z.string().nullable(),
);

export const OpenDocumentResponseSchema = z.object({
  id: z.string(),
});
export type OpenDocumentResponse = z.infer<typeof OpenDocumentResponseSchema>;

/**
 * Wire shape of `GET /v1/docs/:docId/head`. Mirrors the server-side
 * `DocumentHead` interface; the schema is the source of truth so
 * older SDKs talking to newer servers degrade gracefully (extra
 * fields are accepted and ignored).
 *
 * `docVersion` is the single monotonic integer per doc; it bumps on
 * any mutation that could change the manifest's content (page list,
 * per-page content, per-page annotations), which
 * makes `/manifest@docVersion=N` fully content-addressed and cache-friendly.
 * The server's layer mutations bump it.
 */
export const DocumentHeadSchema = z.object({
  id: z.string(),
  baseSha: z.string(),
  storageSizeBytes: z.number().int().nonnegative(),
  docVersion: z.number().int().positive(),
  state: z.enum(['pending', 'ready', 'failed', 'deleting']),
  encryption: z.object({
    state: z.enum(['unknown', 'none', 'encrypted', 'unsupported']),
    requiresPassword: z.boolean().nullable(),
  }),
  permissions: z.object({
    known: z.boolean(),
    bits: z.number().int().nonnegative().nullable(),
    allAllowed: z.boolean().nullable(),
    openedAs: z.enum(['none', 'user', 'owner']).nullable(),
    securityHandlerRevision: z.number().int().nullable(),
    canUpgradeToOwner: z.boolean(),
  }),
  access: z.object({
    required: z.boolean(),
    reasons: z.array(z.enum(['password', 'cdn', 'permissions-unknown'])),
    endpoint: z.string().optional(),
  }),
});
export type DocumentHead = z.infer<typeof DocumentHeadSchema>;

export const AccessRequestSchema = z.object({
  /** Deprecated: identity now rides the path
   *  (`/v1/docs/:docId/layers/:layerName/access`). Kept optional for the
   *  legacy `/v1/access` alias, which requires `docId` in the body. */
  docId: z.string().min(1).optional(),
  layerName: z.string().min(1).optional(),
  password: z.string().optional(),
  passwordGrant: z.string().optional(),
  mode: z.enum(['any', 'owner']).optional(),
  /**
   * How many object numbers the caller's editing session wants now, at
   * most 32: 8 for a new session when absent, 0 for a client that holds
   * enough.
   */
  objectNumbers: z.number().int().nonnegative().optional(),
});
export type AccessRequest = z.infer<typeof AccessRequestSchema>;

/** `first`, `first + 1`, …, `first + count - 1`. */
export const ObjectNumberRangeSchema = z.object({
  first: z.number().int().positive(),
  count: z.number().int().positive(),
});

/** See `EditSessionAccess`. */
export const EditSessionAccessSchema = z.object({
  session: z.enum(['new', 'revived', 'live']),
  expiresIn: z.number().int().nonnegative(),
  objectNumbers: z.array(ObjectNumberRangeSchema),
});

/** See `EditSessionStatus`: the event stream's `session` event. */
export const EditSessionStatusSchema = z.object({
  held: z.array(ObjectNumberRangeSchema),
  expiresIn: z.number().int().nonnegative(),
});

/** `POST …/object-numbers`: a bulk reservation. */
export const ObjectNumberReservationRequestSchema = z.object({
  count: z.number().int().positive(),
});

export const ObjectNumberReservationResponseSchema = z.object({
  objectNumbers: z.array(ObjectNumberRangeSchema),
  expiresIn: z.number().int().nonnegative(),
});

/**
 * Typed boolean view of the PDF user-access permission word. Names
 * mirror the `PdfBits` shape in @embedpdf/engine-core/auth/scope; ISO
 * bit numbers (3, 4, 5, 6, 9, 10, 11, 12).
 */
const PdfBitsObjectSchema = z.object({
  bit3: z.boolean(),
  bit4: z.boolean(),
  bit5: z.boolean(),
  bit6: z.boolean(),
  bit9: z.boolean(),
  bit10: z.boolean(),
  bit11: z.boolean(),
  bit12: z.boolean(),
});

/**
 * Capability-shaped advisory for the client UI. Mirrors
 * `PdfPermissionAdvisory` in @embedpdf/engine-core/runtime; one
 * boolean per UI badge.
 */
const PdfPermissionAdvisoryObjectSchema = z.object({
  canPrint: z.boolean(),
  canPrintHigh: z.boolean(),
  canCopy: z.boolean(),
  canAnnotate: z.boolean(),
  canFillForms: z.boolean(),
  canModifyForms: z.boolean(),
  canModifyPages: z.boolean(),
  canAssemble: z.boolean(),
});

const PdfPermissionInfoObjectSchema: z.ZodType<PdfPermissionInfo> = z.object({
  known: z.boolean(),
  allAllowed: z.boolean().nullable(),
  bits: z.number().int().nonnegative().nullable(),
  openedAs: z.enum(['none', 'user', 'owner']).nullable(),
  securityHandlerRevision: z.number().int().nullable(),
  // Enriched fields from /access (commit 14). Optional so /head, which
  // doesn't always populate them, stays valid against this schema too.
  flags: PdfBitsObjectSchema.optional(),
  advisory: PdfPermissionAdvisoryObjectSchema.optional(),
});

const PdfPermissionInfoSchema = PdfPermissionInfoObjectSchema.nullable();

export const DocumentSecurityStateSchema: z.ZodType<DocumentSecurityState> = z.object({
  encryption: z.object({
    state: z.enum(['unknown', 'none', 'encrypted', 'unsupported']),
    requiresPassword: z.boolean().nullable(),
  }),
  permissions: z.object({
    known: z.boolean(),
    bits: z.number().int().nonnegative().nullable(),
    allAllowed: z.boolean().nullable(),
    openedAs: z.enum(['none', 'user', 'owner']).nullable(),
    securityHandlerRevision: z.number().int().nullable(),
    canUpgradeToOwner: z.boolean(),
  }),
  access: z.object({
    required: z.boolean(),
    reasons: z.array(z.enum(['password', 'cdn', 'permissions-unknown'])),
    endpoint: z.string().optional(),
  }),
});

const positiveCount = z.number().int().positive();

/** See `BundleLimits`. */
export const BundleLimitsSchema = z
  .object({
    bundleBytes: positiveCount,
    manifestBytes: positiveCount,
    items: positiveCount,
    pages: positiveCount,
    resources: positiveCount,
    resourceBytes: positiveCount,
    imagePixels: positiveCount,
  })
  .strict();

export const AccessResponseSchema = z.object({
  security: DocumentSecurityStateSchema,
  cdn: z.object({
    adapter: z.enum(['none', 'cloudfront', 'cloud-cdn', 'bunny', 'azure-fd', 'custom-hmac']),
    expiresAt: z.number().int().positive(),
    cache: z.object({
      scope: z.enum(['browser-private', 'edge-shared']),
      immutableVersionedReads: z.boolean(),
    }),
    baseUrlOverrides: z.record(z.string(), z.string()).nullable(),
    authHeader: z.object({ name: z.string(), value: z.string() }).nullable(),
    // Optional signing channels — each adapter populates the subset it uses
    signedQueryParams: z.record(z.string(), z.string()).nullable(),
    signedCookies: z
      .array(
        z.object({
          name: z.string(),
          value: z.string(),
          domain: z.string().optional(),
          path: z.string().optional(),
          expires: z.number().int().optional(),
        }),
      )
      .nullable(),
    signedPathPolicies: z
      .array(
        z.object({
          pathPrefix: z.string(),
          queryParams: z.record(z.string(), z.string()),
        }),
      )
      .nullable(),
  }),
  passwordGrant: z.string().nullable(),
  pdfPermissions: PdfPermissionInfoSchema,
  scope: z.array(z.string()),
  /**
   * Concrete capability set granted to this caller after expanding
   * `pdf.permissions` and applying resolver implication rules. Client
   * UI should drive feature visibility off this, not off raw `scope`.
   * Always present in /access responses (server populates from
   * `expandRawScope`). Sorted alphabetically for stable change
   * detection.
   */
  effectiveScope: z.array(z.string()),
  /** What the document's signatures forbid; `effectiveScope` already leaves it out. */
  protection: z.lazy(() => DocumentProtectionSchema).nullable(),
  identity: IdentitySchema,
  originPasswordPolicy: z.object({
    mode: z.enum(['not-needed', 'client-retry', 'server-session']),
  }),
  expiresAt: z.number().int().positive(),
  /**
   * The deployment's render lattice — the canonical parameter points the
   * server treats as durable, CDN-shared artifacts. Lives here and never in
   * the manifest: manifests are version-pinned immutable objects; the
   * lattice is mutable deployment policy. The SDK exposes it (and a pure
   * `snap` helper) but never conforms requests implicitly — the same render
   * call must not return different pixels on local vs cloud. When
   * `enforced` is true the server rejects off-lattice render tokens with
   * 400; when false, off-lattice renders are computed but not persisted.
   * Absent on older servers → treat as unenforced/unknown.
   */
  renderPolicy: z
    .object({
      /**
       * Full-page renders quantize on `viewport.width` — the bounded
       * quantity is output pixels, never zoom (PDF page space is
       * effectively unbounded, so a scale lattice bounds artifact count
       * but not size).
       */
      fullPage: z.object({
        widths: z.array(z.number().int().positive()),
      }),
      /**
       * Reserved for deep-zoom tile support: scale-based pyramid ×
       * fixed tile size, constant per-job cost. Absent until the tiling
       * plugin ships.
       */
      tiles: z
        .object({
          tileSizes: z.array(z.number().int().positive()),
          scales: z.array(z.number().positive()),
        })
        .optional(),
      /**
       * Annotation-appearance lattice — scale-based (appearances are sized
       * by `rect × scale` and must track the page's effective render scale
       * for crisp composites).
       */
      appearances: z
        .object({
          scales: z.array(z.number().positive()),
        })
        .optional(),
      /** Worker-side output budget for degenerate page geometry. */
      maxRenderPixels: z.number().int().positive().optional(),
      formats: z.array(z.enum(['webp', 'png'])),
      background: z.enum(['white']),
      enforced: z.boolean(),
    })
    .optional(),
  /** The deployment's limits for an annotation import (see `BundleLimits`). */
  bundleLimits: BundleLimitsSchema,
  /** The caller's editing session (see `DocumentAccessInfo.edit`). */
  edit: EditSessionAccessSchema.optional(),
});
export type AccessResponse = z.infer<typeof AccessResponseSchema>;
export type RenderPolicy = NonNullable<AccessResponse['renderPolicy']>;

export const PdfSaveModeSchema: z.ZodType<PdfSaveMode> = z.enum(['incremental', 'rewrite']);

const engineErrorCodeValues = Object.values(EngineErrorCode) as [
  EngineErrorCode,
  ...EngineErrorCode[],
];

export const EngineErrorPayloadSchema: z.ZodType<SerializedEngineError> = z.object({
  name: z.literal('EngineError'),
  code: z.enum(engineErrorCodeValues),
  message: z.string(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const CachePinsSchema: z.ZodType<CachePins> = z.object({
  contentVersion: z.number().int().positive(),
  annotationVersion: z.number().int().positive(),
  widgetVersion: z.number().int().positive(),
});

/**
 * Plane scopes are derived from the version counters at every emission
 * point (layer manifests, mutation cache envelopes, SSE rows), never stored.
 * Additive/optional both ways: old clients ignore it, old servers omit it
 * (consumers treat absence as all-'layer' — never wrong, only unshared).
 */
const LayerScopeValueSchema = z.enum(['base', 'layer']);
export const LayerScopesSchema: z.ZodType<LayerScopes> = z.object({
  content: LayerScopeValueSchema,
  annotations: LayerScopeValueSchema,
  forms: LayerScopeValueSchema,
  layout: LayerScopeValueSchema,
  attachments: LayerScopeValueSchema,
  metadata: LayerScopeValueSchema,
  actions: LayerScopeValueSchema,
});
export type { LayerScopes, LayerScopePlane } from '../dto/LayerScopes';

/**
 * Per-page envelope inside `DocumentManifest`: the page, plus the
 * cache-busting integers the SDK embeds in leaf URLs
 * (`/pages/:pon/text@contentVersion=N`, `/pages/:pon/annotations@annotationVersion=N`).
 *
 * `contentVersion` bumps when the page's content stream changes
 * (text, page reorder doesn't, the pon is durable). `annotationVersion`
 * bumps when /Annots gains/loses entries or when a tracked annotation
 * mutates. The server derives both from its per-layer page state.
 */
export const ManifestPageSchema: z.ZodType<ManifestPage> = z.object({
  page: PageRefSchema,
  cache: CachePinsSchema,
});
export type { ManifestPage } from '../dto/DocumentManifest';

/**
 * Wire shape of `GET /v1/docs/:docId/manifest@docVersion=N`. Content-addressed
 * by `docVersion`; safe to cache with `Cache-Control: public,
 * max-age=31536000, immutable`.
 */
export const DocumentManifestSchema = z.object({
  docVersion: z.number().int().positive(),
  layoutVersion: z.number().int().positive(),
  metadataVersion: z.number().int().positive(),
  actionsVersion: z.number().int().positive().default(1),
  attachmentsVersion: z.number().int().positive().default(1),
  annotationsVersion: z.number().int().positive().default(1),
  formsVersion: z.number().int().positive().default(1),
  auditHead: z.number().int().nonnegative(),
  baseSha: z.string(),
  // Signing fences (absent on pre-signature servers: unwritten, unknown length).
  layerVersion: z.number().int().nonnegative().default(0),
  working: z.boolean().default(false),
  baseByteLength: z.number().int().nonnegative().default(0),
  // Plane scopes: layer manifests only; absent = all-'layer'.
  scopes: LayerScopesSchema.optional(),
  // Defined further down; lazy so this schema can come first.
  protection: z.lazy(() => DocumentProtectionSchema).nullable(),
  pages: z.array(ManifestPageSchema),
}) as unknown as z.ZodType<DocumentManifest>;
export type { DocumentManifest } from '../dto/DocumentManifest';

/** What both engines' `annotations.list()` return, and the server's list endpoints send. */
export const AnnotationListSchema: z.ZodType<AnnotationList> = z.object({
  annotations: z.array(AnnotationSchema),
  pages: z.array(PageRefSchema),
  auditHead: z.number().int().nonnegative().optional(),
});

/**
 * Wire shape of `GET …/text/pages/:pon/data@<contentVersion>` and the
 * `pages.text` worker result: the UTF-16-faithful extraction, the character
 * space size (`charCount` — the space geometry runs tile; not `text.length`),
 * and the optional character→text anchor map. Malformed maps are rejected
 * here with the shared `charMapViolation` invariants — absent/empty map
 * requires `charCount === text.length` (identity).
 */
export const PageTextSnapshotSchema: z.ZodType<PageTextSnapshot> = z
  .object({
    text: z.string(),
    charCount: z.number().int().nonnegative(),
    charMap: z
      .array(z.tuple([z.number().int().nonnegative(), z.number().int().nonnegative()]))
      .optional(),
  })
  .superRefine((snapshot, ctx) => {
    const violation = charMapViolation(snapshot.charCount, snapshot.text.length, snapshot.charMap);
    if (violation !== null) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['charMap'], message: violation });
    }
  });

export const PageGeometryGlyphSchema = z.object({
  loose: PageBoxSchema,
  tight: PageBoxSchema.optional(),
  space: z.literal(true).optional(),
  empty: z.literal(true).optional(),
});

export const RotatedGeometryGlyphSchema = z.object({
  loose: PageQuadSchema,
  tight: PageQuadSchema.optional(),
  space: z.literal(true).optional(),
  empty: z.literal(true).optional(),
});

export const UprightGeometryRunSchema = z.object({
  rect: PageBoxSchema,
  start: z.number().int().nonnegative(),
  glyphs: z.array(PageGeometryGlyphSchema),
  fontSize: z.number().optional(),
});

export const RotatedGeometryRunSchema = z.object({
  rect: PageBoxSchema,
  start: z.number().int().nonnegative(),
  glyphs: z.array(RotatedGeometryGlyphSchema),
  rotation: z.number(),
  ascentFlip: z.boolean(),
  fontSize: z.number().optional(),
});

// Rotated first: in zod's default strip mode the upright shape would accept a
// zero-glyph rotated run and silently drop its angle; the rotated shape can
// never swallow an upright run (it requires `rotation`/`ascentFlip`).
export const PageGeometryRunSchema: z.ZodType<PageGeometryRun> = z.union([
  RotatedGeometryRunSchema,
  UprightGeometryRunSchema,
]);

export const PageGeometrySnapshotSchema: z.ZodType<PageGeometrySnapshot> = z.object({
  runs: z.array(PageGeometryRunSchema),
});

/**
 * Search wire shapes: the request body of the layer search route and the
 * `search.query` worker/route result. The server re-validates the query
 * semantics (`validateSearchQuery`: regex dialect + flag combos) after
 * parse — the schema only checks structure.
 */
const searchQueryObject = z.object({
  text: z.string(),
  regex: z.boolean().optional(),
  matchCase: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  matchDiacritics: z.boolean().optional(),
  ignoreWhitespace: z.boolean().optional(),
});
export const SearchQuerySchema: z.ZodType<SearchQuery> = searchQueryObject;

export const SearchRequestSchema: z.ZodType<SearchRequest> = searchQueryObject.extend({
  snippets: z.boolean().optional(),
  from: PageRefSchema.optional(),
  cursor: z.string().optional(),
  limit: z
    .object({
      matches: z.number().int().positive().optional(),
      pages: z.number().int().positive().optional(),
    })
    .optional(),
});

export const SearchSnippetSchema: z.ZodType<SearchSnippet> = z.object({
  before: z.string(),
  match: z.string(),
  after: z.string(),
});

export const PdfTextSegmentSchema: z.ZodType<PdfTextSegment> = z.object({
  quad: PageQuadSchema,
  rect: PageBoxSchema,
  advance: z.union([z.literal(1), z.literal(-1)]),
});

export const SearchMatchSchema: z.ZodType<SearchMatch> = z.object({
  page: PageRefSchema,
  start: z.number().int().nonnegative(),
  count: z.number().int().positive(),
  segments: z.array(PdfTextSegmentSchema),
  snippet: SearchSnippetSchema.optional(),
});

export const SearchSliceSchema: z.ZodType<SearchSlice> = z.object({
  matches: z.array(SearchMatchSchema),
  nextCursor: z.string().nullable(),
  pagesSearched: z.number().int().nonnegative(),
  pageCount: z.number().int().nonnegative(),
});

export const PageNetworkRenderFormatSchema: z.ZodType<PageNetworkRenderFormat> = z.enum([
  'png',
  'webp',
]);

/**
 * Wire schema for the cloud render endpoints, applied to the **nested**
 * shape produced by `unflatten(...)` of the parsed token or query string.
 *
 * Adding a new render option is one change here (a new field plus any
 * cross-field rule in `superRefine`) plus one entry in
 * `RenderTokenSchema.fields`. The token codec, flatten/unflatten helpers,
 * route handlers, and SDK URL builder are all generic and pick the new
 * field up automatically.
 *
 * Coercion: token fields and query strings both arrive as strings, so every
 * scalar uses `z.coerce.*`. Discriminated unions on `viewport.kind` and
 * `target.kind` enforce viewport / rect coherence by construction — no
 * superRefine for "fields must appear together" rules.
 */

const RenderViewportSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('width'),
      width: z.coerce.number().positive().finite(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('scale'),
      scale: z.coerce.number().positive().finite().optional(),
    })
    .strict(),
]);

const RenderTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('page') }).strict(),
  z
    .object({
      kind: z.literal('rect'),
      rect: z
        .object({
          x: z.coerce.number().finite(),
          y: z.coerce.number().finite(),
          width: z.coerce.number().positive().finite(),
          height: z.coerce.number().positive().finite(),
        })
        .strict(),
    })
    .strict(),
]);

const RenderRotationSchema = z.preprocess(
  (raw) => (raw === undefined ? undefined : Number(raw)),
  z.number().refine((n) => n === 0 || n === 90 || n === 180 || n === 270, {
    message: 'render rotation must be 0, 90, 180, or 270',
  }),
);

const RenderBackgroundSchema = z.enum(['white', 'transparent']);

/** WebP quality, 0 (smallest) to 1 (best) — the `canvas.toBlob` scale. */
const RenderQualitySchema = z.coerce.number().min(0).max(1);

const AppearanceModeSchema = z.enum(['normal', 'rollover', 'down']);

/**
 * A token's `modes`: the modes it asks for, in the engine's mode order,
 * joined by `-` (`normal-down`). Anything else is refused, so one set of
 * modes has one spelling and one URL.
 */
const AppearanceModesSchema = z.string().transform((value, ctx) => {
  const modes = value.split('-') as AnnotationAppearanceMode[];
  const canonical = ANNOTATION_APPEARANCE_MODES.filter((mode) => modes.includes(mode));
  if (
    canonical.length === 0 ||
    canonical.length === ANNOTATION_APPEARANCE_MODES.length ||
    canonical.join('-') !== value
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        'modes must name some but not all of normal, rollover, down, in that order, joined by -',
    });
    return z.NEVER;
  }
  return canonical;
});

/**
 * Token/path rule: annotatedness is path-expressed —
 * the render family the route belongs to — never token/query-expressed.
 * Each family therefore gets its own query schema, built from one shared
 * base:
 *
 *   - the annotation-free family (`…/render/pages/`) has no
 *     `annotationVersion` field at all — `.strict()` rejects it as an
 *     unrecognized key, so the illegal combination is unrepresentable;
 *   - the annotated family (`…/render/annotated/pages/`) requires
 *     `annotationVersion` on versioned requests — its artifact depends on
 *     the `annotations` plane, so the pin must be in the cache key.
 *
 * Both transforms stamp `includeAnnotations` onto the parsed SDK options
 * from the family, so downstream consumers (worker options, classify) are
 * family-blind.
 */
function buildPageRenderQuerySchema(annotated: boolean): z.ZodType<PageRenderQuery> {
  return z
    .object({
      contentVersion: z.coerce.number().int().positive().optional(),
      ...(annotated
        ? {
            annotationVersion: z.coerce.number().int().positive().optional(),
          }
        : {}),
      format: PageNetworkRenderFormatSchema.optional(),
      viewport: RenderViewportSchema.optional(),
      target: RenderTargetSchema.optional(),
      rotation: RenderRotationSchema.optional(),
      background: RenderBackgroundSchema.optional(),
      quality: RenderQualitySchema.optional(),
    })
    .strict()
    .superRefine((v, ctx) => {
      // The object shape is family-dependent (the free family has no
      // `annotationVersion` key at all), so read the pins through one
      // explicit view instead of letting the conditional spread's union
      // type leak into the refinement.
      const pins = v as { contentVersion?: number; annotationVersion?: number };
      if (pins.contentVersion !== undefined && v.format === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['format'],
          message: 'versioned render requires format',
        });
      }
      if (annotated && pins.annotationVersion !== undefined && pins.contentVersion === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['annotationVersion'],
          message: 'annotationVersion requires contentVersion',
        });
      }
      if (annotated && pins.contentVersion !== undefined && pins.annotationVersion === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['annotationVersion'],
          message: 'versioned annotated render requires annotationVersion',
        });
      }
    })
    .transform((v) => {
      const pins = v as {
        contentVersion?: number;
        annotationVersion?: number;
      };
      const options: PageImageOptions = {
        ...(v.target ? { target: v.target } : {}),
        ...(v.viewport ? { viewport: v.viewport } : {}),
        ...(v.rotation !== undefined ? { rotation: v.rotation } : {}),
        ...(v.background !== undefined ? { background: v.background } : {}),
        ...(v.quality !== undefined ? { quality: v.quality } : {}),
        ...(v.format !== undefined ? { format: v.format } : {}),
        includeAnnotations: annotated,
      };
      return {
        options,
        ...(pins.contentVersion !== undefined ? { contentVersion: pins.contentVersion } : {}),
        ...(pins.annotationVersion !== undefined
          ? { annotationVersion: pins.annotationVersion }
          : {}),
      };
    }) as unknown as z.ZodType<PageRenderQuery>;
}

/** Query/token schema for the annotation-free render family (`page-render`). */
export const PageRenderQuerySchema = buildPageRenderQuerySchema(false);
/** Query/token schema for the annotated render family (`page-render-annotated`). */
export const PageRenderAnnotatedQuerySchema = buildPageRenderQuerySchema(true);

/**
 * Query/token schema of an appearance batch, keyed by `pin`. Mirrors
 * `PageRenderQuerySchema` but without page target/background or
 * `includeAnnotations` (appearances are always annotation-derived), and keyed
 * by the page's pin for its family only — appearance bitmaps do not depend on
 * page base content, so `contentVersion` is not part of the cache key. The
 * endpoint renders every mode and state an annotation stores, or the `modes`
 * asked for.
 */
function buildAppearancesQuerySchema<Pin extends 'annotationVersion' | 'widgetVersion'>(pin: Pin) {
  return z
    .object({
      [pin]: z.coerce.number().int().positive().optional(),
      format: PageNetworkRenderFormatSchema.optional(),
      modes: AppearanceModesSchema.optional(),
      rotation: RenderRotationSchema.optional(),
      viewport: RenderViewportSchema.optional(),
      quality: RenderQualitySchema.optional(),
    } as Record<string, z.ZodTypeAny>)
    .strict()
    .superRefine((v, ctx) => {
      // A versioned (cacheable) request pins its version and must declare
      // the encoded format so the cached URL is unambiguous.
      if (v[pin] !== undefined && v.format === undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['format'],
          message: 'versioned appearance render requires format',
        });
      }
    })
    .transform((v) => {
      const options: AnnotationAppearanceImageOptions = {
        ...(v.rotation !== undefined ? { rotation: v.rotation } : {}),
        ...(v.viewport ? { viewport: v.viewport } : {}),
        ...(v.quality !== undefined ? { quality: v.quality } : {}),
        ...(v.format !== undefined ? { format: v.format } : {}),
        ...(v.modes !== undefined ? { modes: v.modes } : {}),
      };
      return { options, ...(v[pin] !== undefined ? { [pin]: v[pin] } : {}) };
    });
}

/** Query/token schema of a page's annotation images (`annotations/pages/{p}/appearances@`). */
export const AnnotationAppearancesQuerySchema = buildAppearancesQuerySchema(
  'annotationVersion',
) as unknown as z.ZodType<AnnotationAppearancesQuery>;

/** Query/token schema of a page's widget images (`form/pages/{p}/appearances@`). */
export const WidgetAppearancesQuerySchema = buildAppearancesQuerySchema(
  'widgetVersion',
) as unknown as z.ZodType<WidgetAppearancesQuery>;

/**
 * The `body` part of the appearance `multipart/form-data` response.
 * Wire-stable; the cloud client validates the parsed `body` part against
 * this before reconstructing image handles from the binary parts.
 */
export const AnnotationAppearanceBatchSchema: z.ZodType<AnnotationAppearanceBatch> = z.object({
  page: PageRefSchema,
  appearances: z.array(
    z.object({
      resources: ImageResourceKeysSchema,
      ref: AnnotationRefSchema,
      mode: AppearanceModeSchema,
      state: z.string().nullable(),
      rect: PageBoxSchema,
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      format: PageNetworkRenderFormatSchema,
      contentType: z.string().min(1),
    }),
  ),
});

export const CacheDeltaSchema: z.ZodType<CacheDelta> = z.object({
  previousDocVersion: z.number().int().nonnegative(),
  docVersion: z.number().int().positive(),
  annotationsVersion: z.number().int().positive().optional(),
  formsVersion: z.number().int().positive().optional(),
  layoutVersion: z.number().int().positive().optional(),
  metadataVersion: z.number().int().positive().optional(),
  attachmentsVersion: z.number().int().positive().optional(),
  layerVersion: z.number().int().nonnegative().optional(),
  working: z.boolean().optional(),
  pages: z.array(
    z.object({
      page: PageRefSchema,
      cache: CachePinsSchema,
    }),
  ),
});

export const MutationMetaSchema: z.ZodType<MutationMeta> = z.object({
  affectedPages: z.array(PageRefSchema),
  cacheDelta: CacheDeltaSchema.nullable(),
  opId: z.string(),
  undoable: z.boolean(),
});

/**
 * Where rows go in their list, on the wire: `'start'`, `'end'`, or one
 * object naming exactly one neighbour (`before` or `after`).
 */
function listPositionSchema<Ref>(ref: z.ZodType<Ref>): z.ZodType<ListPosition<Ref>> {
  return z.union([
    z.enum(['start', 'end']),
    z
      .object({ before: ref.optional(), after: ref.optional() })
      .strict()
      .refine((position) => (position.before === undefined) !== (position.after === undefined), {
        message: 'exactly one of before or after',
      }),
  ]) as unknown as z.ZodType<ListPosition<Ref>>;
}

/** Where pages go among the document's pages. */
export const PagePositionSchema = listPositionSchema(PageRefSchema);

/** Where annotations go among their page's annotations, or widgets among its widgets. */
export const AnnotationPositionSchema = listPositionSchema(AnnotationRefSchema);

/** Where fields go in the form's calculation order. */
export const FieldPositionSchema = listPositionSchema(FormFieldRefSchema);

/**
 * Stable public component names for the models every part of the document
 * wire shares (page refs, a write's meta, the metadata), like
 * `AnnotationWireComponents`.
 */
export const DocumentWireComponents = {
  PageRef: PageRefSchema,
  PagePosition: PagePositionSchema,
  CacheDelta: CacheDeltaSchema,
  MutationMeta: MutationMetaSchema,
  DocumentMetadata: DocumentMetadataSchema,
  MetadataPatch: MetadataPatchSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

/** Per-page side-effect envelope every annotation mutation returns. Mirrors `AnnotationListMutationMeta`. */
export const AnnotationListMutationMetaSchema: z.ZodType<AnnotationListMutationMeta> = z.object({
  affectedPages: z.array(PageRefSchema),
  cacheDelta: CacheDeltaSchema.nullable(),
  opId: z.string(),
  undoable: z.boolean(),
  changed: z.array(AnnotationRefSchema),
});

export const AnnotationCreateResultSchema: z.ZodType<AnnotationCreateResult> = z.object({
  annotation: AnnotationSchema,
  meta: AnnotationListMutationMetaSchema,
});

export const AnnotationImportResultSchema: z.ZodType<AnnotationImportResult> = z.object({
  annotations: z.array(AnnotationSchema),
  refMap: z.array(z.object({ from: AnnotationRefSchema, to: AnnotationRefSchema })),
  dropped: z.array(
    z.object({
      ref: AnnotationRefSchema,
      field: z.string().optional(),
      reason: z.enum([
        'unsupported-kind',
        'widget',
        'geospatial',
        'unknown-measure',
        'unsupported-action',
        'unsupported-value',
        'name-conflict',
        'parent-dropped',
        'parent-missing',
        'popup-taken',
      ]),
    }),
  ),
  meta: AnnotationListMutationMetaSchema,
}) as z.ZodType<AnnotationImportResult>;

/** The engine's `/AP` verdict riding every update result (see engine-core
 *  `annotation/appearance.ts`). `changed` drives client raster invalidation. */
export const AppearanceOutcomeSchema: z.ZodType<AppearanceOutcome> = z.object({
  action: z.enum(['preserved', 'regenerated', 'generation-unavailable', 'restored']),
  changed: z.boolean(),
});

export const AnnotationUpdateResultSchema: z.ZodType<AnnotationUpdateResult> = z.object({
  annotation: AnnotationSchema,
  appearance: AppearanceOutcomeSchema,
  meta: AnnotationListMutationMetaSchema,
});

export const AnnotationDeleteResultSchema: z.ZodType<AnnotationDeleteResult> = z.object({
  meta: AnnotationListMutationMetaSchema,
});

/**
 * Stable public component names for the annotation wire model, so an OpenAPI
 * projection names each once (`Annotation`, not one type per response that
 * carries one), like `PdfActionWireComponents`.
 */
export const AnnotationWireComponents = {
  Annotation: AnnotationSchema,
  AnnotationRef: AnnotationRefSchema,
  AnnotationDraft: AnnotationDraftSchema,
  AnnotationPatch: AnnotationPatchSchema,
  PdfLinkTarget: PdfLinkTargetSchema,
  PdfLinkTargetWritable: PdfLinkTargetWritableSchema,
  AnnotationList: AnnotationListSchema,
  AnnotationMutationMeta: AnnotationListMutationMetaSchema,
  AnnotationPosition: AnnotationPositionSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

/** What `page.annotations.reorder` takes on the wire. */
export const AnnotationReorderBodySchema = z
  .object({ refs: z.array(AnnotationRefSchema).min(1), position: AnnotationPositionSchema })
  .strict();

/** A stacking-order change: the page's annotations in their new order, as refs. */
export const AnnotationReorderResultSchema: z.ZodType<AnnotationReorderResult> = z.object({
  order: z.array(AnnotationRefSchema),
  meta: AnnotationListMutationMetaSchema,
});

/** A single-field write's meta: the envelope plus the fields and widgets it changed. */
export const FormMutationMetaSchema: z.ZodType<FormMutationMeta> = z.object({
  affectedPages: z.array(PageRefSchema),
  cacheDelta: CacheDeltaSchema.nullable(),
  opId: z.string(),
  undoable: z.boolean(),
  changedFields: z.array(FormFieldRefSchema),
  changedWidgets: z.array(FormWidgetSchema),
});

/**
 * Stable public component names for the form wire model, so an OpenAPI
 * projection names each once (`FormField`, not one type per response that
 * carries one), like `AnnotationWireComponents`.
 */
export const FormWireComponents = {
  FormFieldRef: FormFieldRefSchema,
  FormField: FormFieldDTOSchema,
  FormFieldValue: FormFieldValueSchema,
  FormWidget: FormWidgetSchema,
  FormFieldDraft: FormFieldDraftSchema,
  FormFieldPatch: FormFieldPatchSchema,
  FieldPosition: FieldPositionSchema,
  WidgetPlacement: WidgetPlacementSchema,
  WidgetAnnotation: WidgetDTOSchema,
  WidgetPatch: WidgetPatchSchema,
  FormMutationMeta: FormMutationMetaSchema,
} as const satisfies Record<string, z.ZodTypeAny>;

export const FormSetValueResultSchema: z.ZodType<FormSetValueResult> = z.object({
  field: FormFieldDTOSchema,
  widgets: z.array(WidgetDTOSchema),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormSetValueResult>;

export const FormResetResultSchema: z.ZodType<FormResetResult> = z.object({
  fields: z.array(FormFieldDTOSchema),
  widgets: z.array(WidgetDTOSchema),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormResetResult>;

/** What `reset` takes on the wire: the fields to reset, or none for the whole form. */
export const FormResetBodySchema = z
  .object({ refs: z.array(FormFieldRefSchema).optional() })
  .strict();

/** What `updateWidget` takes on the wire: the widget patch (`PATCH …/form/widgets/{p}/{key}`). */
export const FormWidgetUpdateBodySchema = z.object({ patch: WidgetPatchSchema }).strict();

export const FormEffectSchema: z.ZodType<FormEffect> = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('setValue'), ref: FormFieldRefSchema, value: FormFieldValueSchema }),
  z.object({
    kind: z.literal('setDisplay'),
    ref: FormFieldRefSchema,
    display: z.enum(['visible', 'hidden', 'noPrint', 'noView']),
  }),
  z.object({ kind: z.literal('setAppearanceText'), ref: FormFieldRefSchema, text: z.string() }),
  z.object({ kind: z.literal('reset'), refs: z.array(FormFieldRefSchema) }),
]);

export const FormEffectsResultSchema: z.ZodType<FormEffectsResult> = z.object({
  results: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      status: z.enum(['applied', 'unchanged', 'rejected', 'failed', 'skipped']),
      fields: z.array(FormFieldDTOSchema),
      changedWidgets: z.array(FormWidgetSchema),
      error: EngineErrorPayloadSchema.optional(),
    }),
  ),
  widgets: z.array(WidgetDTOSchema),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormEffectsResult>;

export const FormImportResultSchema: z.ZodType<FormImportResult> = z.object({
  fields: z.array(FormFieldDTOSchema),
  widgets: z.array(WidgetDTOSchema),
  refMap: z.array(z.object({ from: FormFieldRefSchema, to: FormFieldRefSchema })),
  dropped: z.array(
    z.object({
      ref: FormFieldRefSchema.nullable(),
      widget: AnnotationRefSchema.optional(),
      field: z.string().optional(),
      reason: z.enum([
        'name-conflict',
        'no-field',
        'unsupported-family',
        'script-not-allowed',
        'unsupported-action',
      ]),
    }),
  ),
  calculationOrder: z.array(FormFieldRefSchema).optional(),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormImportResult>;

export const FormValuesImportResultSchema: z.ZodType<FormValuesImportResult> = z.object({
  fields: z.array(FormFieldDTOSchema),
  widgets: z.array(WidgetDTOSchema),
  dropped: z.array(
    z.object({
      ref: FormFieldRefSchema,
      reason: z.enum(['no-field', 'wrong-family', 'value-not-allowed', 'locked']),
    }),
  ),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormValuesImportResult>;

export const FormFieldCreateResultSchema: z.ZodType<FormFieldCreateResult> = z.object({
  field: FormFieldDTOSchema,
  widgets: z.array(WidgetDTOSchema),
  calculationOrder: z.array(FormFieldRefSchema).optional(),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormFieldCreateResult>;

export const FormFieldUpdateResultSchema: z.ZodType<FormFieldUpdateResult> = z.object({
  field: FormFieldDTOSchema,
  widgets: z.array(WidgetDTOSchema),
  calculationOrder: z.array(FormFieldRefSchema).optional(),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormFieldUpdateResult>;

export const FormWidgetUpdateResultSchema: z.ZodType<FormWidgetUpdateResult> = z.object({
  widget: WidgetDTOSchema,
  appearance: AppearanceOutcomeSchema,
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormWidgetUpdateResult>;

/** What `forms.reorderWidgets` takes on the wire: the widgets of one page and where they go. */
export const FormWidgetsReorderBodySchema = z
  .object({ widgets: z.array(AnnotationRefSchema).min(1), position: AnnotationPositionSchema })
  .strict();

/** A widget stacking-order change: the page's widgets in their new order, as refs. */
export const FormWidgetsReorderResultSchema: z.ZodType<FormWidgetsReorderResult> = z.object({
  page: PageRefSchema,
  order: z.array(AnnotationRefSchema),
  meta: FormMutationMetaSchema,
});

export const FormFieldDeleteResultSchema: z.ZodType<FormFieldDeleteResult> = z.object({
  calculationOrder: z.array(FormFieldRefSchema).optional(),
  meta: FormMutationMetaSchema,
});

/** What `forms.reorderCalculations` takes on the wire: the fields and where they go. */
export const FormCalculationsReorderBodySchema = z
  .object({ fields: z.array(FormFieldRefSchema).min(1), position: FieldPositionSchema })
  .strict();

/** A calculation-order change: the form's whole new order. */
export const FormCalculationsReorderResultSchema: z.ZodType<FormCalculationsReorderResult> =
  z.object({
    calculationOrder: z.array(FormFieldRefSchema),
    meta: FormMutationMetaSchema,
  });

export const FormWidgetLinkResultSchema: z.ZodType<FormWidgetLinkResult> = z.object({
  field: FormFieldDTOSchema,
  widgets: z.array(WidgetDTOSchema),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormWidgetLinkResult>;

export const FormWidgetDeleteResultSchema: z.ZodType<FormWidgetDeleteResult> = z.object({
  widget: AnnotationRefSchema,
  page: PageRefSchema,
  field: FormFieldDTOSchema.nullable(),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormWidgetDeleteResult>;

export const FormWidgetRestoreResultSchema: z.ZodType<FormWidgetRestoreResult> = z.object({
  field: FormFieldDTOSchema.nullable(),
  widgets: z.array(WidgetDTOSchema),
  meta: FormMutationMetaSchema,
}) as unknown as z.ZodType<FormWidgetRestoreResult>;

export const FormRepairResultSchema: z.ZodType<FormRepairResult> = z.object({
  acroformCreated: z.boolean(),
  fieldsLinked: z.number().int().nonnegative(),
  widgetsLinked: z.number().int().nonnegative(),
  fieldsUnrepairable: z.number().int().nonnegative(),
  appearancesBaked: z.number().int().nonnegative(),
  needsAppearancesCleared: z.boolean(),
  meta: MutationMetaSchema,
});

/**
 * A PDF box in PDF user space as a `PdfRect` (`{ left, bottom, right, top }`,
 * y-up edges, un-rotated, not origin-normalized). Re-exported from the
 * canonical geometry schema so the wire and the runtime agree.
 */
export { PdfRectSchema };

/** A page's five boxes in page space: measured from the top-left of the crop box. */
export const PageBoxesSchema: z.ZodType<PageBoxes> = z.object({
  media: PageBoxSchema,
  crop: PageBoxSchema,
  bleed: PageBoxSchema,
  trim: PageBoxSchema,
  art: PageBoxSchema,
});

/**
 * Pure geometry for one page (`pages.list()` element). No annotation
 * liveness — that lives on annotation reads and the manifest.
 */
export const PageLayoutSchema: z.ZodType<PageLayout> = z.object({
  index: z.number().int().nonnegative(),
  ref: PageRefSchema,
  label: z.string().nullable(),
  size: PdfSizeSchema,
  rotation: PdfRotationSchema,
  userUnit: z.number().positive(),
  boxes: PageBoxesSchema,
  pdfCropBox: PdfRectSchema,
  actions: PdfPageActionsSchema.optional(),
});

export const PageFlattenResultSchema: z.ZodType<PageFlattenResult> = z.object({
  pages: z.array(PageRefSchema),
  usage: z.enum(['display', 'print']),
  results: z.array(
    z.object({
      page: PageRefSchema,
      status: z.enum(['applied', 'unchanged']),
    }),
  ),
  meta: MutationMetaSchema,
});

/** See `AnnotationFlattenResult`. */
export const AnnotationFlattenResultSchema: z.ZodType<AnnotationFlattenResult> = z.object({
  page: PageRefSchema,
  usage: z.enum(['display', 'print']),
  results: z.array(
    z.object({
      ref: AnnotationRefSchema,
      status: z.enum(['applied', 'unchanged']),
    }),
  ),
  meta: MutationMetaSchema,
});

/** `annotations.flatten` input — see `AnnotationFlattenInput`. */
export const AnnotationFlattenInputSchema: z.ZodType<AnnotationFlattenInput> = z.object({
  refs: z.array(AnnotationRefSchema).min(1),
  usage: z.enum(['display', 'print']),
});

/** `annotations.exportAppearance` input — see `AnnotationAppearanceExportInput`. */
export const AnnotationAppearanceExportInputSchema: z.ZodType<AnnotationAppearanceExportInput> =
  z.object({
    refs: z.array(AnnotationRefSchema).min(1),
  });

/** `doc.annotations.export` selection — see `AnnotationExportSelection`. */
export const AnnotationExportSelectionSchema: z.ZodType<AnnotationExportSelection> = z
  .object({
    refs: z.array(AnnotationRefSchema).optional(),
    pages: z.array(PageRefSchema).optional(),
    include: z.enum(['references', 'threads']).optional(),
  })
  .strict();

/**
 * The body of a POST annotation export: the pins a GET's token carries and
 * the selection, for one a URL can't carry.
 */
export const AnnotationsExportRequestSchema = z
  .object({
    annotationsVersion: z.number().int().positive(),
    layoutVersion: z.number().int().positive(),
    selection: AnnotationExportSelectionSchema,
  })
  .strict();

/** Where an import puts each page of a bundle — see `BundleImportPages`. */
const BundleImportPagesSchema = z.union([
  z.literal('same'),
  z.literal('by-position'),
  z.array(z.object({ from: PageRefSchema, to: PageRefSchema }).strict()),
]);

/** `doc.forms.export` selection — see `FormExportSelection`. */
export const FormExportSelectionSchema: z.ZodType<FormExportSelection> = z
  .object({
    fields: z.array(FormFieldRefSchema).optional(),
    pages: z.array(PageRefSchema).optional(),
  })
  .strict();

/**
 * The body of a POST form export: the pins a GET's token carries and the
 * selection, for one a URL can't carry.
 */
export const FormExportRequestSchema = z
  .object({
    formsVersion: z.number().int().positive(),
    layoutVersion: z.number().int().positive(),
    selection: FormExportSelectionSchema,
  })
  .strict();

/** `doc.forms.import` options on the wire; the `opId` is the `Idempotency-Key` header. */
export const FormImportOptionsSchema: z.ZodType<Omit<FormImportOptions, 'opId'>> = z
  .object({
    pages: BundleImportPagesSchema.optional(),
    attribution: z.enum(['restore', 'stamp']).optional(),
    values: z.boolean().optional(),
  })
  .strict();

/** `doc.forms.importValues` options on the wire. */
export const FormValuesImportOptionsSchema: z.ZodType<Omit<FormValuesImportOptions, 'opId'>> = z
  .object({ attribution: z.enum(['restore', 'stamp']).optional() })
  .strict();

/** A form bundle's envelope: its rows are the worker's to check, as an annotation bundle's. */
const FormBundleEnvelopeSchema = z
  .object({
    format: z.literal('embedpdf/form'),
    version: z.literal(1),
    pages: z.array(z.unknown()),
    fields: z.array(z.unknown()),
    widgets: z.array(z.unknown()),
    calculationOrder: z.array(z.unknown()),
  })
  .strict();

/** The `body` part of a form import request. */
export const FormImportBodySchema: z.ZodType<FormImportBody> = z
  .object({ bundle: FormBundleEnvelopeSchema, options: FormImportOptionsSchema })
  .strict() as unknown as z.ZodType<FormImportBody>;

/** The `body` part of a form values import request. */
export const FormValuesImportBodySchema: z.ZodType<FormValuesImportBody> = z
  .object({ bundle: FormBundleEnvelopeSchema, options: FormValuesImportOptionsSchema })
  .strict() as unknown as z.ZodType<FormValuesImportBody>;

/** `doc.annotations.import` options on the wire; the `opId` is the `Idempotency-Key` header. */
export const AnnotationImportOptionsSchema: z.ZodType<Omit<AnnotationImportOptions, 'opId'>> = z
  .object({
    pages: BundleImportPagesSchema.optional(),
    attribution: z.enum(['restore', 'stamp']).optional(),
  })
  .strict();

/**
 * The `body` part of an import request. Only its envelope is checked
 * here: the bundle's pages and items are the worker's to check, against the
 * limits and each kind's create schema.
 */
export const AnnotationImportBodySchema: z.ZodType<AnnotationImportBody> = z
  .object({
    bundle: z
      .object({
        format: z.literal('embedpdf/annotations'),
        version: z.literal(1),
        pages: z.array(z.unknown()),
        items: z.array(z.unknown()),
      })
      .strict(),
    options: AnnotationImportOptionsSchema,
  })
  .strict() as unknown as z.ZodType<AnnotationImportBody>;

export const PageFlattenInputSchema: z.ZodType<PageFlattenInput> = z.object({
  pages: z.array(PageRefSchema),
  usage: z.enum(['display', 'print']),
});

/**
 * `{ pages }` or `{ annotations }`: one object with exactly one of the two,
 * so the wire has no untagged union (the API reference labels variants by a
 * discriminating literal, and a scope has none to add).
 */
export const RedactionApplyScopeSchema: z.ZodType<RedactionApplyScope> = z
  .object({
    pages: z.array(PageRefSchema).optional(),
    annotations: z.array(AnnotationRefSchema).optional(),
  })
  .strict()
  .refine((scope) => (scope.pages === undefined) !== (scope.annotations === undefined), {
    message: 'exactly one of pages or annotations',
  }) as unknown as z.ZodType<RedactionApplyScope>;

export const RedactionApplyResultSchema: z.ZodType<RedactionApplyResult> = z.object({
  scope: RedactionApplyScopeSchema,
  results: z.array(
    z.object({
      page: PageRefSchema,
      status: z.enum(['applied', 'unchanged']),
      removedAnnotationCount: z.number().int().nonnegative(),
    }),
  ),
  removedAnnotationCount: z.number().int().nonnegative(),
  meta: MutationMetaSchema,
});

/**
 * Snapshot of every page in display order. Pages are addressed by
 * `pageObjectNumber` everywhere except the per-element `index`, which is
 * display order and intentionally not an identity. Carries geometry only.
 */
/** See `NamedPageEntry`: decoded key + what it resolves to. */
export const NamedPageEntrySchema: z.ZodType<NamedPageEntry> = z.object({
  name: z.string(),
  target: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('page'), page: PageRefSchema }),
    z.object({ kind: z.literal('template'), objectNumber: z.number().int().positive() }),
    z.object({ kind: z.literal('dangling') }),
  ]),
});

export const PageListSnapshotSchema: z.ZodType<PageListSnapshot> = z.object({
  pageCount: z.number().int().nonnegative(),
  pages: z.array(PageLayoutSchema),
  namedPages: z.array(NamedPageEntrySchema),
});

/** `pages.setName` input — see `PageNameInput`. */
export const PageNameInputSchema: z.ZodType<PageNameInput> = z.object({
  name: z.string().min(1),
  page: PageRefSchema,
  replace: z.string().min(1).optional(),
});

/** `pages.removeName` input — see `PageRemoveNameInput`. */
export const PageRemoveNameInputSchema: z.ZodType<PageRemoveNameInput> = z.object({
  name: z.string().min(1),
});

/** Page reorder input: the pages, in their new order, and where they go. */
export const PageReorderInputSchema: z.ZodType<PageReorderInput> = z
  .object({
    pages: z.array(PageRefSchema).min(1),
    position: PagePositionSchema,
  })
  .strict();

/**
 * Page reorder result. No per-page revision is bumped (they survive a page
 * reorder). The whole new order is returned so callers swap their snapshot.
 */
export const PageReorderResultSchema: z.ZodType<PageReorderResult> = z.object({
  pages: z.array(PageRefSchema),
  layout: PageListSnapshotSchema,
  meta: MutationMetaSchema,
});

/** Named-page mutation result — layout-shaped, see `PageNameResult`. */
export const PageNameResultSchema: z.ZodType<PageNameResult> = z.object({
  layout: PageListSnapshotSchema,
  meta: MutationMetaSchema,
});

/**
 * Page rotate input. Absolute rotation (idempotent — see `PageRotateInput`),
 * one value applied to every listed page.
 */
export const PageRotateInputSchema: z.ZodType<PageRotateInput> = z.object({
  pages: z.array(PageRefSchema),
  rotation: PdfRotationSchema,
});

/**
 * Page rotate result. Rotation is presentation metadata over normalized
 * content: nothing per-page invalidates; the new `layout` carries the
 * rotation values (see `PageRotateResult`).
 */
export const PageRotateResultSchema: z.ZodType<PageRotateResult> = z.object({
  layout: PageListSnapshotSchema,
  meta: MutationMetaSchema,
});

/** Page delete input. Deleting every page is rejected server/worker-side. */
export const PageDeleteInputSchema: z.ZodType<PageDeleteInput> = z.object({
  pages: z.array(PageRefSchema),
});

/**
 * Page delete result. Deleted page object numbers are retired (never recycled); surviving
 * pages keep identity + revisions (see `PageDeleteResult`).
 */
export const PageDeleteResultSchema: z.ZodType<PageDeleteResult> = z.object({
  layout: PageListSnapshotSchema,
  meta: MutationMetaSchema,
});

/**
 * Page insert (bytes) input — the `body` part of the multipart envelope;
 * the PDF rides the part `resources.source` names. `position` omitted →
 * `'end'`.
 */
export const PageInsertInputSchema: z.ZodType<{
  position?: ListPosition<PageRef>;
  resources: { source: string };
}> = z
  .object({ position: PagePositionSchema.optional(), resources: SourceResourceKeysSchema })
  .strict();

/**
 * Blank-page insert input — plain JSON, pages.insert minus the bytes.
 * `size` is in PDF points (un-rotated); `count` shares the contract cap
 * with the worker so a request the schema accepts cannot then fail the
 * worker's own guard.
 */
export const PageInsertBlankInputSchema: z.ZodType<{
  size: { width: number; height: number };
  count?: number;
  position?: ListPosition<PageRef>;
}> = z.object({
  size: z.object({
    width: z.number().positive().finite(),
    height: z.number().positive().finite(),
  }),
  count: z.number().int().min(1).max(PAGE_INSERT_BLANK_MAX_COUNT).optional(),
  position: PagePositionSchema.optional(),
});

/** Page extract input: the pages to export, in the order they should appear. */
export const PageExtractInputSchema: z.ZodType<{ pages: PageRef[] }> = z.object({
  pages: z.array(PageRefSchema).min(1),
});

/**
 * Page insert result — shared by bytes-insert and blank-insert: the fresh
 * page object numbers in insertion order plus the full new layout (see `PageInsertResult`).
 */
export const PageInsertResultSchema: z.ZodType<PageInsertResult> = z.object({
  insertedPages: z.array(PageRefSchema),
  layout: PageListSnapshotSchema,
  meta: MutationMetaSchema,
});

/** See `AttachmentMutationMeta`. */
export const AttachmentMutationMetaSchema: z.ZodType<AttachmentMutationMeta> = z.object({
  affectedPages: z.array(PageRefSchema),
  cacheDelta: CacheDeltaSchema.nullable(),
  opId: z.string(),
  undoable: z.boolean(),
  changed: z.array(AttachmentRefSchema),
});

export const AttachmentCreateResultSchema: z.ZodType<AttachmentCreateResult> = z.object({
  attachment: AttachmentSchema,
  meta: AttachmentMutationMetaSchema,
});

export const AttachmentDeleteResultSchema: z.ZodType<AttachmentDeleteResult> = z.object({
  meta: AttachmentMutationMetaSchema,
});

/** See `AttachmentList`. */
export const AttachmentListSchema: z.ZodType<AttachmentList> = z.object({
  attachments: z.array(AttachmentSchema),
});

/**
 * Metadata write result: the re-read `metadata`. On the cloud,
 * `meta.cacheDelta` advances only `docVersion` and `metadataVersion`.
 */
export const MetadataUpdateResultSchema: z.ZodType<MetadataUpdateResult> = z.object({
  metadata: DocumentMetadataSchema,
  meta: MutationMetaSchema,
});

export const CustomMetadataUpdateResultSchema: z.ZodType<CustomMetadataUpdateResult> = z.object({
  custom: CustomMetadataSchema,
  meta: MutationMetaSchema,
});

// ---------------------------------------------------------------------------
// Digital signatures: the JSON forms of the two-phase signing DTOs.
//
// `SignaturePrepared.digest` and `SignatureCompleteInput.cms` are bytes;
// `JSON.stringify` turns a typed array into an index-keyed object, which
// the completion gate then rejects. These codecs are the one definition
// the HTTP bodies and the server's durable `prepared_json` share.
// ---------------------------------------------------------------------------

export { fromBase64, toBase64 };

const Base64Schema = z.string().regex(/^[A-Za-z0-9+/]*={0,2}$/, 'base64');

export const DocumentVersionRefSchema: z.ZodType<DocumentVersionRef> = z.object({
  baseSha256: z.string().regex(/^[0-9a-f]{64}$/),
  editsVersion: z.number().int().nonnegative(),
});

export const ByteRangeSchema = z.tuple([
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
  z.number().int().nonnegative(),
]);

/** `SignaturePrepared` with the digest as base64. */
export const SignaturePreparedWireSchema = z.object({
  signingId: z.string().min(1),
  digest: Base64Schema,
  algorithm: z.enum(['sha256', 'sha384', 'sha512']),
  byteRange: ByteRangeSchema,
  contentsSize: z.number().int().positive(),
  subFilter: z.string(),
  expectedVersion: DocumentVersionRefSchema,
  expiresAt: z.string().nullable(),
});
export type SignaturePreparedWire = z.infer<typeof SignaturePreparedWireSchema>;

export function encodePrepared(prepared: SignaturePrepared): SignaturePreparedWire {
  return { ...prepared, digest: toBase64(prepared.digest) };
}

export function decodePrepared(wire: SignaturePreparedWire): SignaturePrepared {
  return {
    ...wire,
    digest: fromBase64(wire.digest),
    subFilter: wire.subFilter as SignaturePrepared['subFilter'],
  };
}

/** The JSON body of a completion: the CMS as base64 beside the fence. */
export const SignatureCompleteBodySchema = z.object({
  cms: Base64Schema.refine((v) => v.length > 0, 'cms is required'),
  expectedVersion: DocumentVersionRefSchema,
});
export type SignatureCompleteBody = z.infer<typeof SignatureCompleteBodySchema>;

// ---------------------------------------------------------------------------
// Digital signatures: the read-side DTOs, the prepare body, the analysis
// query, and the version catalog.
// ---------------------------------------------------------------------------

const DocMdpPermissionSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);
const ModificationLevelSchema = z.enum(['none', 'lta', 'fill', 'annotate']);
const DigestAlgorithmSchema = z.enum(['sha1', 'sha256', 'sha384', 'sha512']);

export const FieldLockSpecSchema: z.ZodType<FieldLockSpec> = z.object({
  action: z.enum(['all', 'include', 'exclude']),
  fields: z.array(z.string()),
  permission: DocMdpPermissionSchema.optional(),
});

export const SignatureSeedValueSchema: z.ZodType<SignatureSeedValue> = z.object({
  requiredFlags: z.number().int(),
  presentFlags: z.number().int(),
  version: z.number().int().nullable(),
  mdp: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  filter: z.string().nullable(),
  subFilters: z.array(z.string()),
  digestMethods: z.array(z.string()),
  reasons: z.array(z.string()),
  unsupportedRequired: z.boolean(),
});

export const SignatureDTOSchema: z.ZodType<SignatureDTO> = z.object({
  index: z.number().int().nonnegative(),
  field: FormFieldRefSchema,
  fieldName: z.string(),
  widget: FormFieldWidgetSchema.nullable(),
  signed: z.boolean(),
  kind: z.enum(['signature', 'timestamp']),
  filter: z.string().nullable(),
  subFilter: z.string().nullable(),
  byteRange: ByteRangeSchema.nullable(),
  contentsSize: z.number().int().nonnegative(),
  coverage: z.enum(['whole-revision', 'partial', 'malformed']).nullable(),
  revisionIndex: z.number().int().nonnegative().nullable(),
  signer: z.object({
    name: z.string().nullable(),
    reason: z.string().nullable(),
    location: z.string().nullable(),
    contactInfo: z.string().nullable(),
    signedAt: IsoDateTimeSchema.nullable(),
  }),
  docMdp: DocMdpPermissionSchema.nullable(),
  catalogCertification: z.boolean(),
  fieldMdp: FieldLockSpecSchema.nullable(),
  lock: FieldLockSpecSchema.nullable(),
  seedValue: SignatureSeedValueSchema.nullable(),
});

export const DocumentProtectionSchema: z.ZodType<DocumentProtection> = z.object({
  enforced: ModificationLevelSchema.nullable(),
  judged: ModificationLevelSchema.nullable(),
  certification: z
    .object({ signatureIndex: z.number().int().nonnegative(), permission: DocMdpPermissionSchema })
    .nullable(),
  fieldLocks: z.array(
    z.object({
      signatureIndex: z.number().int().nonnegative(),
      source: z.enum(['fieldmdp', 'lock']),
      spec: FieldLockSpecSchema,
    }),
  ),
  policyVersion: z.number().int(),
});

export const PdfRevisionSchema: z.ZodType<PdfRevision> = z.object({
  index: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
  xrefOffset: z.number().int().nonnegative(),
  signatureIndex: z.number().int().nonnegative().nullable(),
});

export const SignatureSnapshotSchema: z.ZodType<SignatureSnapshot> = z.object({
  chainValid: z.boolean(),
  revisions: z.array(PdfRevisionSchema),
  signatures: z.array(SignatureDTOSchema),
  protection: DocumentProtectionSchema,
});

export const BaseVersionInfoSchema: z.ZodType<BaseVersionInfo> = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteLength: z.number().int().nonnegative(),
});

export const SignatureCompleteResultSchema: z.ZodType<SignatureCompleteResult> = z.object({
  status: z.enum(['completed', 'already-completed']),
  signature: SignatureDTOSchema,
  version: BaseVersionInfoSchema,
  previous: DocumentVersionRefSchema,
  protection: DocumentProtectionSchema,
  meta: MutationMetaSchema,
});

export const SignatureCancelResultSchema: z.ZodType<SignatureCancelResult> = z.object({
  status: z.enum(['cancelled', 'already-completed', 'unknown']),
});

const ChangeFindingSchema = z.object({
  rule: z.string(),
  verdict: z.enum(['permitted', 'forbidden', 'incomplete']),
  objectNumber: z.number().int().nonnegative(),
  edge: z.string().optional(),
  detail: z.string().optional(),
});

const AnalysisDetailSchema = z.enum(['summary', 'full']);

/** The analysis: one verdict (`current`) with its findings, the restrictions it was judged under, and facts about the revisions in between. */
export const ChangeAnalysisSchema = z.object({
  mode: z.enum(['authoritative', 'exploratory']),
  policyVersion: z.number().int(),
  basis: z.object({
    version: BaseVersionInfoSchema,
    editsVersion: z.number().int().nonnegative(),
    source: z.enum(['persisted', 'working-copy']),
  }),
  since: z.object({
    revisionIndex: z.number().int().nonnegative(),
    signatureIndex: z.number().int().nonnegative().nullable(),
  }),
  until: z.object({ revisionIndex: z.number().int().nonnegative() }),
  restrictions: z.array(
    z.object({
      signatureIndex: z.number().int().nonnegative(),
      revisionIndex: z.number().int().nonnegative(),
      source: z.enum(['docmdp', 'fieldmdp', 'lock']),
      own: z.boolean(),
      permission: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      fields: z.unknown().optional(),
    }),
  ),
  current: z.object({
    verdict: z.enum(['unchanged', 'permitted', 'forbidden', 'indeterminate']),
    complete: z.boolean(),
    primary: ChangeFindingSchema.optional(),
    findings: z.array(ChangeFindingSchema),
    method: z.enum(['net-state', 'net-state+replay']),
  }),
  later: z.object({
    revisionCount: z.number().int().nonnegative(),
    undoneObjectNumbers: z.array(z.number().int().nonnegative()),
  }),
  /** Equals `current.verdict`. */
  verdict: z.enum(['unchanged', 'permitted', 'forbidden', 'indeterminate']),
  /** The step DTOs are large and evolving; carried verbatim. */
  steps: z.array(z.unknown()),
}) as unknown as z.ZodType<ChangeAnalysis>;

const SignatureSignerInputSchema = z.object({
  name: z.string().optional(),
  reason: z.string().optional(),
  location: z.string().optional(),
  contactInfo: z.string().optional(),
  signedAt: IsoDateTimeSchema.optional(),
});

/** The `body` part of a visual signature fill: which part holds the one-page PDF. */
export const SignatureAppearanceBodySchema = z.object({
  resources: AppearanceResourceKeysSchema,
});
export type SignatureAppearanceBody = z.infer<typeof SignatureAppearanceBodySchema>;

/**
 * The `body` part of a prepare: `SignaturePrepareInput` with the
 * appearance artwork named by the key of its part instead of inline bytes.
 */
export const SignaturePrepareBodySchema = z.object({
  field: FormFieldRefSchema,
  kind: z.enum(['signature', 'timestamp']).optional(),
  subFilter: z.enum(['adbe.pkcs7.detached', 'ETSI.CAdES.detached']).optional(),
  digest: z.enum(['sha256', 'sha384', 'sha512']).optional(),
  contentsSize: z.number().int().positive().optional(),
  signer: SignatureSignerInputSchema.optional(),
  certify: z.object({ permission: DocMdpPermissionSchema }).optional(),
  lock: FieldLockSpecSchema.optional(),
  resources: AppearanceResourceKeysSchema.optional(),
});
export type SignaturePrepareBody = z.infer<typeof SignaturePrepareBodySchema>;

const optionalIndex = z.coerce.number().int().nonnegative().optional();

/** Layer analysis query (the current form): exactly one `since.*`; the working copy is the end. */
export const LayerAnalysisQuerySchema = z
  .object({
    'since.signature': optionalIndex,
    'since.revision': optionalIndex,
    level: ModificationLevelSchema.optional(),
    detail: AnalysisDetailSchema.optional(),
  })
  .refine((q) => (q['since.signature'] === undefined) !== (q['since.revision'] === undefined), {
    message: 'exactly one of since.signature / since.revision is required',
  });
export type LayerAnalysisQuery = z.infer<typeof LayerAnalysisQuerySchema>;

/** Version analysis query: as the layer's, plus `until` (a revision index; default the last). */
export const VersionAnalysisQuerySchema = z
  .object({
    'since.signature': optionalIndex,
    'since.revision': optionalIndex,
    until: optionalIndex,
    level: ModificationLevelSchema.optional(),
    detail: AnalysisDetailSchema.optional(),
    /** The judging policy version the caller expects — a cache key, not an input (version responses are immutable). */
    policy: optionalIndex,
  })
  .refine((q) => (q['since.signature'] === undefined) !== (q['since.revision'] === undefined), {
    message: 'exactly one of since.signature / since.revision is required',
  });
export type VersionAnalysisQuery = z.infer<typeof VersionAnalysisQuerySchema>;

export function analyzeInputFromQuery(
  query: LayerAnalysisQuery | VersionAnalysisQuery,
  until: AnalyzeInput['until'],
): AnalyzeInput {
  const since =
    query['since.signature'] !== undefined
      ? { signatureIndex: query['since.signature'] }
      : { revisionIndex: query['since.revision'] ?? 0 };
  return {
    since,
    ...(until !== undefined ? { until } : {}),
    ...(query.level !== undefined ? { exploratoryLevel: query.level } : {}),
    ...(query.detail !== undefined ? { detail: query.detail } : {}),
  };
}

/** One row of the document's version catalog. */
export const DocumentVersionSchema = z.object({
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
  byteLength: z.number().int().nonnegative(),
  number: z.number().int().positive(),
  parentSha256: z.string().nullable(),
  producer: z.enum(['upload', 'signature']),
  signingId: z.string().nullable(),
  createdAt: z.number().int(),
});
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const DocumentVersionsSchema = z.object({
  /** `documents.base_sha`: the version every layer is over, or behind. */
  head: z.string().regex(/^[0-9a-f]{64}$/),
  /** Oldest first. */
  versions: z.array(DocumentVersionSchema),
});
export type DocumentVersions = z.infer<typeof DocumentVersionsSchema>;

export { DigestAlgorithmSchema, ModificationLevelSchema };

export const PageScaleResultSchema = z.object({
  page: PageRefSchema,
  meta: MutationMetaSchema,
});
