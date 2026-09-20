import { z } from 'zod';

import type {
  AnnotationListPageSnapshot,
  AnnotationListSnapshotAllPages,
} from '../annotation/AnnotationListSnapshot';
import {
  AnnotationRefSchema,
  AnnotationStableIdSchema,
  RevisionTokenSchema,
} from '../annotation/base.schema';
import { AnnotationDTOSchema } from '../annotation/kinds';
import type {
  AnnotationAppearanceImageOptions,
  AnnotationAppearanceManifest,
  AnnotationAppearancesQuery,
} from '../dto/AnnotationRender';
import { EmbeddedFileItemSchema, EmbeddedFileRefSchema } from '../dto/Attachment.schema';
import type { CachePins } from '../dto/CachePins';
import type { DocumentManifest, ManifestPage } from '../dto/DocumentManifest';
import type { LayerScopes } from '../dto/LayerScopes';
import type { DocumentMetadata } from '../dto/DocumentMetadata';
import type { MetadataPatch } from '../dto/MetadataPatch';
import type { AnalyzeInput, ChangeAnalysis } from '../signature/analysis/types';
import type {
  BaseVersionInfo,
  DocumentProtection,
  DocumentVersionRef,
  FieldLockSpec,
  PdfRevision,
  SignatureAbortResult,
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
import { FormFieldDTOSchema, FormSnapshotSchema, FormWidgetRefSchema } from '../forms/schema';
import { FormFieldRefSchema, FormFieldValueSchema } from '../forms/schema';
import {
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
  AnnotationMoveResult,
  AnnotationUpdateResult,
} from '../mutation/AnnotationMutationResults';
import type {
  AttachmentCreateResult,
  AttachmentDeleteResult,
  AttachmentsCache,
} from '../mutation/AttachmentMutationResults';
import type {
  FormFieldCreateResult,
  FormFieldDeleteResult,
  FormFieldUpdateResult,
  FormImportResult,
  FormRepairResult,
  FormSetValueResult,
  FormWidgetLinkResult,
} from '../mutation/FormMutationResults';
import type { MetadataUpdateResult } from '../mutation/MetadataUpdateResult';
import type { CacheDelta, MutationMeta } from '../mutation/MutationMeta';
import type { PageDeleteInput } from '../mutation/PageDeleteInput';
import type { PageDeleteResult } from '../mutation/PageDeleteResult';
import { PAGE_INSERT_BLANK_MAX_COUNT } from '../mutation/PageInsertBlankInput';
import type { PageInsertResult } from '../mutation/PageInsertResult';
import type { PageFlattenInput, PageFlattenResult } from '../mutation/PageFlattenResult';
import type { RedactionApplyResult, RedactionApplyScope } from '../mutation/RedactionApplyResult';
import type { PageMoveInput } from '../mutation/PageMoveInput';
import type { PageMoveResult } from '../mutation/PageMoveResult';
import type {
  AnnotationAppearanceExportInput,
  AnnotationFlattenInput,
  AnnotationFlattenResult,
} from '../mutation/AnnotationFlattenResult';
import type { PageNameInput, PageRemoveNameInput } from '../mutation/PageNameInput';
import type { PageNameResult } from '../mutation/PageNameResult';
import type { PageRotateInput } from '../mutation/PageRotateInput';
import type { PageRotateResult } from '../mutation/PageRotateResult';
import type { PageStructureCache } from '../mutation/PageStructureCache';
import type { RefetchReason } from '../mutation/RefetchReason';
import type { PageState } from '../revision/PageState';
import type { WeakAnnotationState } from '../revision/WeakAnnotationState';
import type {
  SearchMatch,
  SearchQuery,
  SearchRequest,
  SearchSlice,
  SearchSnippet,
} from '../search/types';
import type { PdfTextSegment } from '../text/layout';
export type { CacheDelta, MutationMeta } from '../mutation/MutationMeta';

export const DocumentMetadataSchema: z.ZodType<DocumentMetadata> = z.object({
  title: z.string().nullable(),
  author: z.string().nullable(),
  subject: z.string().nullable(),
  keywords: z.string().nullable(),
  producer: z.string().nullable(),
  creator: z.string().nullable(),
  created: z.string().datetime().nullable(),
  modified: z.string().datetime().nullable(),
  trapped: z.enum(['true', 'false', 'unknown']),
  custom: z.record(z.string(), z.string()),
});

/**
 * Three-state metadata patch. Mirrors annotation patch semantics:
 * `undefined` leaves a field, `null` clears it, a value sets it. `custom`
 * is a per-key three-state map (string set / null clear / absent leave).
 */
export const MetadataPatchSchema: z.ZodType<MetadataPatch> = z
  .object({
    title: z.string().nullable().optional(),
    author: z.string().nullable().optional(),
    subject: z.string().nullable().optional(),
    keywords: z.string().nullable().optional(),
    producer: z.string().nullable().optional(),
    creator: z.string().nullable().optional(),
    created: z.string().datetime().nullable().optional(),
    modified: z.string().datetime().nullable().optional(),
    trapped: z.enum(['true', 'false', 'unknown']).optional(),
    custom: z.record(z.string(), z.string().nullable()).optional(),
  })
  .strict();

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
 * ANY mutation that could change the manifest's content (page list,
 * per-page content, per-page annotations, per-page weak-flag), which
 * makes `/manifest@docVersion=N` fully content-addressed and cache-friendly.
 * Phase 4 hard-codes it to `1`; Phase 5's mutation handler is what
 * actually bumps it.
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
  /** Deprecated: identity now rides the PATH
   *  (`/v1/docs/:docId/layers/:layerName/access`). Kept optional for the
   *  legacy `/v1/access` alias, which requires `docId` in the body. */
  docId: z.string().min(1).optional(),
  layerName: z.string().min(1).optional(),
  password: z.string().optional(),
  passwordGrant: z.string().optional(),
  mode: z.enum(['any', 'owner']).optional(),
});
export type AccessRequest = z.infer<typeof AccessRequestSchema>;

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
  identity: z.object({
    user_id: z.string().optional(),
    group_id: z.string().optional(),
    groups: z.array(z.string()).optional(),
    display_name: z.string().optional(),
  }),
  originPasswordPolicy: z.object({
    mode: z.enum(['not-needed', 'client-retry', 'server-session']),
  }),
  expiresAt: z.number().int().positive(),
  /**
   * The deployment's render lattice — the canonical parameter points the
   * server treats as durable, CDN-shared artifacts. Lives HERE and never in
   * the manifest: manifests are version-pinned immutable objects; the
   * lattice is mutable deployment policy. The SDK exposes it (and a pure
   * `snap` helper) but NEVER conforms requests implicitly — the same render
   * call must not return different pixels on local vs cloud. When
   * `enforced` is true the server rejects off-lattice render tokens with
   * 400; when false, off-lattice renders are computed but not persisted.
   * Absent on older servers → treat as unenforced/unknown.
   */
  renderPolicy: z
    .object({
      /**
       * Full-page renders quantize on `viewport.width` — the bounded
       * quantity is OUTPUT PIXELS, never zoom (PDF page space is
       * effectively unbounded, so a scale lattice bounds artifact count
       * but not size).
       */
      fullPage: z.object({
        widths: z.array(z.number().int().positive()),
      }),
      /**
       * RESERVED for deep-zoom tile support: scale-based pyramid ×
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
       * Annotation-appearance lattice — SCALE-based (appearances are sized
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

export const WeakAnnotationStateSchema: z.ZodType<WeakAnnotationState> = z.discriminatedUnion(
  'kind',
  [
    z.object({ kind: z.literal('unknown') }),
    z.object({
      kind: z.literal('known'),
      hasAnyWeakAnnotations: z.boolean(),
    }),
  ],
);

export const PageStateSchema: z.ZodType<PageState> = z.object({
  pageObjectNumber: z.number().int().positive(),
  revision: RevisionTokenSchema,
  weakAnnotationState: WeakAnnotationStateSchema,
});

export const CachePinsSchema: z.ZodType<CachePins> = z.object({
  contentVersion: z.number().int().positive(),
  annotationVersion: z.number().int().positive(),
});

/**
 * Plane scopes are DERIVED from the version counters at every emission
 * point (layer manifests, mutation cache envelopes, SSE rows), never stored.
 * Additive/optional both ways: old clients ignore it, old servers omit it
 * (consumers treat absence as all-'layer' — never wrong, only unshared).
 */
const LayerScopeValueSchema = z.enum(['base', 'layer']);
export const LayerScopesSchema: z.ZodType<LayerScopes> = z.object({
  content: LayerScopeValueSchema,
  annotations: LayerScopeValueSchema,
  layout: LayerScopeValueSchema,
  attachments: LayerScopeValueSchema,
  metadata: LayerScopeValueSchema,
  actions: LayerScopeValueSchema,
});
export type { LayerScopes, LayerScopePlane } from '../dto/LayerScopes';

/**
 * Per-page envelope inside `DocumentManifest`. Carries the full
 * `PageState` plus the cache-busting integers the SDK embeds in
 * leaf URLs (`/pages/:pon/text@contentVersion=N`, `/pages/:pon/annotations@annotationVersion=N`).
 *
 * `contentVersion` bumps when the page's content stream changes
 * (text, page reorder doesn't, the pon is durable). `annotationVersion`
 * bumps when /Annots gains/loses entries or when a tracked annotation
 * mutates. `hasWeakAnnotations` is hoisted from `PageState` so the
 * SDK can decide whether to display a "stale-on-reorder" badge
 * without re-fetching the page.
 *
 * Phase 4 hard-codes all three to (1, 1, false); Phase 5's
 * `layer_pages` table drives the real values.
 */
export const ManifestPageSchema: z.ZodType<ManifestPage> = z
  .object({
    state: PageStateSchema,
    cache: CachePinsSchema,
  })
  .superRefine((page, ctx) => {
    if (page.state.weakAnnotationState.kind !== 'known') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['state', 'weakAnnotationState'],
        message: 'manifest pages must have a known weak annotation state',
      });
    }
  }) as z.ZodType<ManifestPage>;
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
  auditHead: z.number().int().nonnegative(),
  baseSha: z.string(),
  // Signing fences (absent on pre-signature servers: unwritten, unknown length).
  layerVersion: z.number().int().nonnegative().default(0),
  working: z.boolean().default(false),
  baseByteLength: z.number().int().nonnegative().default(0),
  // Plane scopes: layer manifests only; absent = all-'layer'.
  scopes: LayerScopesSchema.optional(),
  pages: z.array(ManifestPageSchema),
}) as unknown as z.ZodType<DocumentManifest>;
export type { DocumentManifest } from '../dto/DocumentManifest';

export const AnnotationListPageSnapshotSchema: z.ZodType<AnnotationListPageSnapshot> = z.object({
  pageState: PageStateSchema,
  annotations: z.array(AnnotationDTOSchema),
});

export const AnnotationListSnapshotAllPagesSchema: z.ZodType<AnnotationListSnapshotAllPages> =
  z.object({
    pages: z.array(AnnotationListPageSnapshotSchema),
    // Cloud stamps the manifest's transactional audit cursor; local omits it.
    auditHead: z.number().int().nonnegative().optional(),
  });

/**
 * Wire shape of `GET …/text/pages/:pon/data@<contentVersion>` and the
 * `pages.text` worker result: the UTF-16-faithful extraction, the CHARACTER
 * space size (`charCount` — the space geometry runs tile; NOT `text.length`),
 * and the optional character→text anchor map. Malformed maps are rejected
 * here with the shared `charMapViolation` invariants — absent/empty map
 * REQUIRES `charCount === text.length` (identity).
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
  looseBox: PdfRectSchema,
  flags: z.number().int().nonnegative(),
  tightBox: PdfRectSchema.optional(),
});

export const RotatedGeometryGlyphSchema = z.object({
  looseQuad: PdfQuadSchema,
  flags: z.number().int().nonnegative(),
  tightQuad: PdfQuadSchema.optional(),
});

export const UprightGeometryRunSchema = z.object({
  rect: PdfRectSchema,
  charStart: z.number().int().nonnegative(),
  glyphs: z.array(PageGeometryGlyphSchema),
  fontSize: z.number().optional(),
});

export const RotatedGeometryRunSchema = z.object({
  rect: PdfRectSchema,
  charStart: z.number().int().nonnegative(),
  glyphs: z.array(RotatedGeometryGlyphSchema),
  rotation: z.number(),
  ascentFlip: z.boolean(),
  fontSize: z.number().optional(),
});

// Rotated first: in zod's default strip mode the upright shape would accept a
// zero-glyph rotated run and silently drop its rotation; the rotated shape can
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
export const SearchQuerySchema: z.ZodType<SearchQuery> = z.object({
  text: z.string(),
  regex: z.boolean().optional(),
  matchCase: z.boolean().optional(),
  wholeWord: z.boolean().optional(),
  matchDiacritics: z.boolean().optional(),
  ignoreWhitespace: z.boolean().optional(),
});

export const SearchModeSchema = z.enum(['rects', 'full']);

export const SearchRequestSchema: z.ZodType<SearchRequest> = z.object({
  query: SearchQuerySchema,
  mode: SearchModeSchema.optional(),
  cursor: z.string().optional(),
  startPage: z.number().int().positive().optional(),
  skip: z.number().int().nonnegative().optional(),
  budget: z
    .object({
      maxMatches: z.number().int().positive().optional(),
      maxPages: z.number().int().positive().optional(),
    })
    .optional(),
});

export const SearchSnippetSchema: z.ZodType<SearchSnippet> = z.object({
  text: z.string(),
  matchStart: z.number().int().nonnegative(),
  matchLength: z.number().int().positive(),
});

export const PdfTextSegmentSchema: z.ZodType<PdfTextSegment> = z.object({
  quad: PdfQuadSchema,
  rect: PdfRectSchema,
  advance: z.union([z.literal(1), z.literal(-1)]),
});

export const SearchMatchSchema: z.ZodType<SearchMatch> = z.object({
  pageObjectNumber: z.number().int().positive(),
  charStart: z.number().int().nonnegative(),
  charCount: z.number().int().positive(),
  segments: z.array(PdfTextSegmentSchema),
  snippet: SearchSnippetSchema.optional(),
});

export const SearchSliceSchema: z.ZodType<SearchSlice> = z.object({
  matches: z.array(SearchMatchSchema),
  nextCursor: z.string().nullable(),
  scannedPages: z.number().int().nonnegative(),
  totalPages: z.number().int().nonnegative(),
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
          left: z.coerce.number().finite(),
          bottom: z.coerce.number().finite(),
          right: z.coerce.number().finite(),
          top: z.coerce.number().finite(),
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

const RenderQualitySchema = z.coerce.number().int().min(1).max(100);

/**
 * Token/path rule: annotatedness is PATH-expressed —
 * the render FAMILY the route belongs to — never token/query-expressed.
 * Each family therefore gets its own query schema, built from one shared
 * base:
 *
 *   - the annotation-free family (`…/render/pages/`) has NO
 *     `annotationVersion` field at all — `.strict()` rejects it as an
 *     unrecognized key, so the illegal combination is unrepresentable;
 *   - the annotated family (`…/render/annotated/pages/`) REQUIRES
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
      ...(annotated ? { annotationVersion: z.coerce.number().int().positive().optional() } : {}),
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
      const pins = v as { contentVersion?: number; annotationVersion?: number };
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
 * Query/token schema for the batch annotation-appearance render endpoint.
 * Mirrors `PageRenderQuerySchema` but without page target/viewport/background
 * or `includeAnnotations` (appearances are always annotation-derived), and
 * keyed by `annotationVersion` only — appearance bitmaps do not depend on
 * page base content, so `contentVersion` is not part of the cache key. The
 * endpoint renders the Normal appearance only.
 */
export const AnnotationAppearancesQuerySchema = z
  .object({
    annotationVersion: z.coerce.number().int().positive().optional(),
    format: PageNetworkRenderFormatSchema.optional(),
    rotation: RenderRotationSchema.optional(),
    scale: z.coerce.number().positive().finite().optional(),
    quality: RenderQualitySchema.optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    // A versioned (cacheable) request pins the annotation version and must
    // declare the encoded format so the cached URL is unambiguous.
    if (v.annotationVersion !== undefined && v.format === undefined) {
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
      ...(v.scale !== undefined ? { scale: v.scale } : {}),
      ...(v.quality !== undefined ? { quality: v.quality } : {}),
      ...(v.format !== undefined ? { format: v.format } : {}),
    };
    return {
      options,
      ...(v.annotationVersion !== undefined ? { annotationVersion: v.annotationVersion } : {}),
    };
  }) as unknown as z.ZodType<AnnotationAppearancesQuery>;

/**
 * The JSON manifest part of the appearance `multipart/form-data` response.
 * Wire-stable; the cloud client validates the parsed `manifest` part against
 * this before reconstructing image handles from the binary parts.
 */
export const AnnotationAppearanceManifestSchema: z.ZodType<AnnotationAppearanceManifest> = z.object(
  {
    pageState: PageStateSchema,
    appearances: z.array(
      z.object({
        part: z.string().min(1),
        ref: AnnotationRefSchema,
        mode: z.enum(['normal', 'rollover', 'down']),
        rect: PdfRectSchema,
        width: z.number().int().positive(),
        height: z.number().int().positive(),
        format: PageNetworkRenderFormatSchema,
        contentType: z.string().min(1),
      }),
    ),
  },
);

/**
 * Reasons a mutation tells the client its old snapshot is stale. Wire-stable;
 * extend with care (forward-compat clients accept only known values).
 */
export const RefetchReasonSchema: z.ZodType<RefetchReason> = z.enum([
  'weakRefsInvalidated',
  'externalChange',
  'pageRebuilt',
]);

export const CacheDeltaSchema: z.ZodType<CacheDelta> = z.object({
  previousDocVersion: z.number().int().positive(),
  docVersion: z.number().int().positive(),
  annotationsVersion: z.number().int().positive().optional(),
  layerVersion: z.number().int().nonnegative().optional(),
  working: z.boolean().optional(),
  pages: z.array(
    z.object({
      pageObjectNumber: z.number().int().positive(),
      cache: CachePinsSchema,
    }),
  ),
});

export const MutationMetaSchema: z.ZodType<MutationMeta> = z.object({
  affectedPages: z.array(PageStateSchema),
  cacheDelta: CacheDeltaSchema.nullable(),
});

/**
 * Per-page side-effect envelope every annotation mutation returns. Mirrors
 * `AnnotationListMutationMeta`. The `shouldRefetch` field is `null` when the
 * client's existing index-based references remain valid; non-null only when
 * the engine knows for sure the snapshot is stale.
 */
export const AnnotationListMutationMetaSchema: z.ZodType<AnnotationListMutationMeta> = z.object({
  affectedPages: z.array(PageStateSchema),
  cacheDelta: CacheDeltaSchema.nullable(),
  changed: z.array(AnnotationStableIdSchema),
  weakRefsInvalidated: z.boolean(),
  shouldRefetch: z.object({ reason: RefetchReasonSchema }).nullable(),
});

export const AnnotationCreateResultSchema: z.ZodType<AnnotationCreateResult> = z.object({
  created: AnnotationDTOSchema,
  meta: AnnotationListMutationMetaSchema,
});

/** The engine's `/AP` verdict riding every update result (see engine-core
 *  `annotation/appearance.ts`). `changed` drives client raster invalidation. */
export const AppearanceOutcomeSchema: z.ZodType<AppearanceOutcome> = z.object({
  action: z.enum(['preserved', 'regenerated', 'generation-unavailable']),
  changed: z.boolean(),
});

export const AnnotationUpdateResultSchema: z.ZodType<AnnotationUpdateResult> = z.object({
  updated: AnnotationDTOSchema,
  appearance: AppearanceOutcomeSchema,
  meta: AnnotationListMutationMetaSchema,
});

/**
 * `deleted` is nullable: a weak annotation (no /NM, no indirect object
 * number) has no durable id to report after removal. Cloud server and local
 * worker both emit `null` in that case so callers don't have to special-case
 * a sentinel.
 */
export const AnnotationDeleteResultSchema: z.ZodType<AnnotationDeleteResult> = z.object({
  deleted: AnnotationStableIdSchema.nullable(),
  meta: AnnotationListMutationMetaSchema,
});

/**
 * Batch annotation move (contiguous-block, symmetric with `pages.move`).
 * `moved` is in caller order; each `moved[i]` lives at index `toIndex + i`
 * after the move. ONE structural envelope per batch.
 */
export const AnnotationMoveResultSchema: z.ZodType<AnnotationMoveResult> = z.object({
  moved: z.array(AnnotationDTOSchema),
  meta: AnnotationListMutationMetaSchema,
});

export const FormSetValueResultSchema: z.ZodType<FormSetValueResult> = z.object({
  field: FormFieldDTOSchema,
  changedWidgets: z.array(FormWidgetRefSchema),
  meta: MutationMetaSchema,
});

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
      changedWidgets: z.array(FormWidgetRefSchema),
      error: EngineErrorPayloadSchema.optional(),
    }),
  ),
  changedWidgets: z.array(FormWidgetRefSchema),
  meta: MutationMetaSchema.nullable(),
});

export const FormImportResultSchema: z.ZodType<FormImportResult> = z.object({
  fieldsTotal: z.number().int().nonnegative(),
  fieldsApplied: z.number().int().nonnegative(),
  fieldsSkipped: z.number().int().nonnegative(),
  widgetsChanged: z.number().int().nonnegative(),
  snapshot: FormSnapshotSchema,
  meta: MutationMetaSchema,
});

export const FormFieldCreateResultSchema: z.ZodType<FormFieldCreateResult> = z.object({
  field: FormFieldDTOSchema,
  meta: MutationMetaSchema,
});

export const FormFieldUpdateResultSchema: z.ZodType<FormFieldUpdateResult> = z.object({
  field: FormFieldDTOSchema,
  meta: MutationMetaSchema,
});

export const FormFieldDeleteResultSchema: z.ZodType<FormFieldDeleteResult> = z.object({
  deletedFieldObjectNumber: z.number().int().positive(),
  removedWidgets: z.array(FormWidgetRefSchema),
  meta: MutationMetaSchema,
});

export const FormWidgetLinkResultSchema: z.ZodType<FormWidgetLinkResult> = z.object({
  field: FormFieldDTOSchema,
  meta: MutationMetaSchema,
});

export const FormRepairResultSchema: z.ZodType<FormRepairResult> = z.object({
  acroformCreated: z.boolean(),
  fieldsLinked: z.number().int().nonnegative(),
  widgetsLinked: z.number().int().nonnegative(),
  fieldsUnrepairable: z.number().int().nonnegative(),
  appearancesBaked: z.number().int().nonnegative(),
  needAppearancesCleared: z.boolean(),
  meta: MutationMetaSchema,
});

/**
 * A PDF box in PDF user space as a `PdfRect` (`{ left, bottom, right, top }`,
 * y-up edges, un-rotated, not origin-normalized). Re-exported from the
 * canonical geometry schema so the wire and the runtime agree.
 */
export { PdfRectSchema };

export const PageBoxesSchema: z.ZodType<PageBoxes> = z.object({
  media: PdfRectSchema,
  crop: PdfRectSchema,
  bleed: PdfRectSchema.optional(),
  trim: PdfRectSchema.optional(),
  art: PdfRectSchema.optional(),
});

/**
 * Pure geometry for one page (`pages.list()` element). No annotation
 * liveness — that lives on annotation reads and the manifest.
 */
export const PageLayoutSchema: z.ZodType<PageLayout> = z.object({
  index: z.number().int().nonnegative(),
  pageObjectNumber: z.number().int().positive(),
  label: z.string().nullable(),
  size: PdfSizeSchema,
  rotation: PdfRotationSchema,
  userUnit: z.number().positive(),
  boxes: PageBoxesSchema,
  actions: PdfPageActionsSchema.optional(),
});

export const PageFlattenResultSchema: z.ZodType<PageFlattenResult> = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()),
  usage: z.enum(['display', 'print']),
  results: z.array(
    z.object({
      pageObjectNumber: z.number().int().positive(),
      status: z.enum(['applied', 'unchanged', 'failed', 'skipped']),
      error: EngineErrorPayloadSchema.optional(),
    }),
  ),
  meta: MutationMetaSchema.nullable(),
});

/** See `AnnotationFlattenResult`. */
export const AnnotationFlattenResultSchema: z.ZodType<AnnotationFlattenResult> = z.object({
  pageObjectNumber: z.number().int().positive(),
  usage: z.enum(['display', 'print']),
  results: z.array(
    z.object({
      ref: AnnotationRefSchema,
      status: z.enum(['applied', 'skipped']),
    }),
  ),
  meta: MutationMetaSchema.nullable(),
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

export const PageFlattenInputSchema: z.ZodType<PageFlattenInput> = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()),
  usage: z.enum(['display', 'print']),
});

export const RedactionApplyScopeSchema: z.ZodType<RedactionApplyScope> = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('pages'),
      pageObjectNumbers: z.array(z.number().int().positive()),
    }),
    z.object({
      kind: z.literal('annotations'),
      refs: z.array(AnnotationRefSchema),
    }),
  ],
) as unknown as z.ZodType<RedactionApplyScope>;

export const RedactionApplyResultSchema: z.ZodType<RedactionApplyResult> = z.object({
  scope: RedactionApplyScopeSchema,
  results: z.array(
    z.object({
      pageObjectNumber: z.number().int().positive(),
      status: z.enum(['applied', 'unchanged', 'failed', 'skipped']),
      removedAnnotationCount: z.number().int().nonnegative(),
      error: EngineErrorPayloadSchema.optional(),
    }),
  ),
  removedAnnotationCount: z.number().int().nonnegative(),
  meta: MutationMetaSchema.nullable(),
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
    z.object({ kind: z.literal('page'), pageObjectNumber: z.number().int().positive() }),
    z.object({ kind: z.literal('template'), objectNumber: z.number().int().positive() }),
    z.object({ kind: z.literal('dangling') }),
  ]),
});

export const PageListSnapshotSchema: z.ZodType<PageListSnapshot> = z.object({
  pageCount: z.number().int().nonnegative(),
  pages: z.array(PageLayoutSchema),
  namedPages: z.array(NamedPageEntrySchema).optional(),
});

/** `pages.setName` input — see `PageNameInput`. */
export const PageNameInputSchema: z.ZodType<PageNameInput> = z.object({
  name: z.string().min(1),
  pageObjectNumber: z.number().int().positive(),
  replace: z.string().min(1).optional(),
});

/** `pages.removeName` input — see `PageRemoveNameInput`. */
export const PageRemoveNameInputSchema: z.ZodType<PageRemoveNameInput> = z.object({
  name: z.string().min(1),
});

/**
 * Page reorder input. Pages are always addressed by `pageObjectNumber`;
 * `destIndex` is the insertion point in the post-removal index space.
 */
export const PageMoveInputSchema: z.ZodType<PageMoveInput> = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()),
  destIndex: z.number().int().nonnegative(),
});

/**
 * Coherence pins shared by every page-STRUCTURE result (move/rotate/delete) —
 * see `PageStructureCache`. Nullable at each use site (local engines).
 */
export const PageStructureCacheSchema: z.ZodType<PageStructureCache> = z.object({
  previousDocVersion: z.number().int().nonnegative(),
  docVersion: z.number().int().positive(),
  layoutVersion: z.number().int().positive(),
});

/**
 * Page reorder result. No revision is bumped (no doc-level revision exists,
 * and per-page revisions intentionally survive a page reorder). The full
 * post-move order is returned so callers can swap their snapshot directly.
 */
export const PageMoveResultSchema: z.ZodType<PageMoveResult> = z.object({
  layout: PageListSnapshotSchema,
  cache: PageStructureCacheSchema.nullable(),
});

/** Named-page mutation result — layout-shaped, see `PageNameResult`. */
export const PageNameResultSchema: z.ZodType<PageNameResult> = z.object({
  layout: PageListSnapshotSchema,
  cache: PageStructureCacheSchema.nullable(),
});

/**
 * Page rotate input. ABSOLUTE rotation (idempotent — see `PageRotateInput`),
 * one value applied to every listed page.
 */
export const PageRotateInputSchema: z.ZodType<PageRotateInput> = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()),
  rotation: PdfRotationSchema,
});

/**
 * Page rotate result. Rotation is presentation metadata over normalized
 * content: nothing per-page invalidates; the new `layout` carries the
 * rotation values (see `PageRotateResult`).
 */
export const PageRotateResultSchema: z.ZodType<PageRotateResult> = z.object({
  layout: PageListSnapshotSchema,
  cache: PageStructureCacheSchema.nullable(),
});

/** Page delete input. Deleting every page is rejected server/worker-side. */
export const PageDeleteInputSchema: z.ZodType<PageDeleteInput> = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()),
});

/**
 * Page delete result. Deleted PONs are retired (never recycled); surviving
 * pages keep identity + revisions (see `PageDeleteResult`).
 */
export const PageDeleteResultSchema: z.ZodType<PageDeleteResult> = z.object({
  layout: PageListSnapshotSchema,
  cache: PageStructureCacheSchema.nullable(),
});

/**
 * Page insert (bytes) input — the JSON `body` part of the multipart
 * mutation envelope; the PDF itself rides the `resource:source` part.
 * `destIndex` omitted → append.
 */
export const PageInsertInputSchema: z.ZodType<{ destIndex?: number }> = z.object({
  destIndex: z.number().int().nonnegative().optional(),
});

/**
 * Blank-page insert input — plain JSON, pages.insert minus the bytes.
 * `size` is in PDF points (un-rotated); `count` shares the contract cap
 * with the worker so a request the schema accepts cannot then fail the
 * worker's own guard.
 */
export const PageInsertBlankInputSchema: z.ZodType<{
  size: { width: number; height: number };
  count?: number;
  destIndex?: number;
}> = z.object({
  size: z.object({
    width: z.number().positive().finite(),
    height: z.number().positive().finite(),
  }),
  count: z.number().int().min(1).max(PAGE_INSERT_BLANK_MAX_COUNT).optional(),
  destIndex: z.number().int().nonnegative().optional(),
});

/** Page extract input: the pages to export, in the order they should appear. */
export const PageExtractInputSchema: z.ZodType<{ pageObjectNumbers: number[] }> = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()).min(1),
});

/**
 * Page insert result — shared by bytes-insert and blank-insert: the fresh
 * PONs in insertion order plus the full new layout (see `PageInsertResult`).
 */
export const PageInsertResultSchema: z.ZodType<PageInsertResult> = z.object({
  insertedPageObjectNumbers: z.array(z.number().int().positive()),
  layout: PageListSnapshotSchema,
  cache: PageStructureCacheSchema.nullable(),
});

/**
 * Metadata write result. The Info dict is rewritten in place, so the
 * result returns the re-read `metadata` plus cloud coherence pins. No
 * `layoutVersion` is touched — a metadata edit bumps only `docVersion`
 * and `metadataVersion`. `cache` is `null` for local engines.
 */
export const AttachmentsCacheSchema: z.ZodType<AttachmentsCache> = z.object({
  previousDocVersion: z.number().int().nonnegative(),
  docVersion: z.number().int().positive(),
  attachmentsVersion: z.number().int().positive(),
});

export const AttachmentCreateResultSchema: z.ZodType<AttachmentCreateResult> = z.object({
  created: EmbeddedFileItemSchema,
  cache: AttachmentsCacheSchema.nullable(),
});

export const AttachmentDeleteResultSchema: z.ZodType<AttachmentDeleteResult> = z.object({
  deleted: EmbeddedFileRefSchema,
  cache: AttachmentsCacheSchema.nullable(),
});

export const MetadataUpdateResultSchema: z.ZodType<MetadataUpdateResult> = z.object({
  metadata: DocumentMetadataSchema,
  cache: z
    .object({
      previousDocVersion: z.number().int().nonnegative(),
      docVersion: z.number().int().positive(),
      metadataVersion: z.number().int().positive(),
    })
    .nullable(),
});

export const WeakAnnotationSessionResponseSchema = z.object({
  sessionId: z.string().min(1),
  expiresAt: z.number().int().positive(),
  heartbeatIntervalMs: z.number().int().positive(),
  pageObjectNumbers: z.array(z.number().int().positive()),
});
export type WeakAnnotationSessionResponse = z.infer<typeof WeakAnnotationSessionResponseSchema>;

export const WeakAnnotationSessionPagesRequestSchema = z.object({
  pageObjectNumbers: z.array(z.number().int().positive()).transform((pages) => [...new Set(pages)]),
});
export type WeakAnnotationSessionPagesRequest = z.infer<
  typeof WeakAnnotationSessionPagesRequestSchema
>;

// ---------------------------------------------------------------------------
// Digital signatures: the JSON forms of the two-phase signing DTOs.
//
// `SignaturePrepared.digest` and `SignatureCompleteInput.cms` are bytes;
// `JSON.stringify` turns a typed array into an index-keyed object, which
// the completion gate then rejects. These codecs are the ONE definition
// the HTTP bodies and the server's durable `prepared_json` share.
// ---------------------------------------------------------------------------

const BASE64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Standard base64 (padded). Dependency-free: no Buffer, runs in browsers too. */
export function toBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = bytes[i + 1];
    const b2 = bytes[i + 2];
    out += BASE64_ALPHABET[b0 >> 2];
    out += BASE64_ALPHABET[((b0 & 0x03) << 4) | ((b1 ?? 0) >> 4)];
    out += b1 === undefined ? '=' : BASE64_ALPHABET[((b1 & 0x0f) << 2) | ((b2 ?? 0) >> 6)];
    out += b2 === undefined ? '=' : BASE64_ALPHABET[b2 & 0x3f];
  }
  return out;
}

export function fromBase64(encoded: string): Uint8Array {
  // Scan backward to avoid regex backtracking on long runs of interior padding.
  let end = encoded.length;
  while (end > 0 && encoded[end - 1] === '=') {
    end -= 1;
  }
  const clean = encoded.slice(0, end);
  if (clean.length % 4 === 1 || /[^A-Za-z0-9+/]/.test(clean)) {
    throw new Error('malformed base64');
  }
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    buffer = (buffer << 6) | BASE64_ALPHABET.indexOf(ch);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }
  return Uint8Array.from(bytes);
}

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
  widget: FormWidgetRefSchema.nullable(),
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
    claimedTime: z.string().nullable(),
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

export const SignatureAbortResultSchema: z.ZodType<SignatureAbortResult> = z.object({
  status: z.enum(['aborted', 'already-completed', 'unknown']),
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

const SignatureAttributionSchema = z.object({
  name: z.string().optional(),
  reason: z.string().optional(),
  location: z.string().optional(),
  contactInfo: z.string().optional(),
});

/** The JSON part of a visual signature fill (multipart envelope): which resource part holds the PDF, and its page. */
export const SignatureAppearanceBodySchema = z.object({
  resource: z.string().min(1),
  pageIndex: z.number().int().nonnegative().optional(),
});
export type SignatureAppearanceBody = z.infer<typeof SignatureAppearanceBodySchema>;

/**
 * The JSON part of a prepare (multipart envelope): `SignaturePrepareInput`
 * with the appearance artwork referenced by its resource part instead of
 * inline bytes.
 */
export const SignaturePrepareBodySchema = z.object({
  field: FormFieldRefSchema,
  kind: z.enum(['signature', 'timestamp']).optional(),
  subFilter: z.enum(['adbe.pkcs7.detached', 'ETSI.CAdES.detached']).optional(),
  digest: z.enum(['sha256', 'sha384', 'sha512']).optional(),
  contentsSize: z.number().int().positive().optional(),
  attribution: SignatureAttributionSchema.optional(),
  /** @deprecated the pre-rename spelling of `attribution`; servers read either. */
  signer: SignatureAttributionSchema.optional(),
  signingTime: z.string().optional(),
  certify: z.object({ permission: DocMdpPermissionSchema }).optional(),
  lock: FieldLockSpecSchema.optional(),
  appearance: z
    .object({ resource: z.string().min(1), pageIndex: z.number().int().nonnegative().optional() })
    .optional(),
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
