import type { TokenSchema } from './token';

export const DocTokenSchema = {
  fields: ['docVersion'],
} as const satisfies TokenSchema;

export const ContentTokenSchema = {
  fields: ['contentVersion'],
} as const satisfies TokenSchema;

export const LayoutTokenSchema = {
  fields: ['layoutVersion'],
} as const satisfies TokenSchema;

export const MetadataTokenSchema = {
  fields: ['metadataVersion'],
} as const satisfies TokenSchema;

export const AnnotationTokenSchema = {
  fields: ['annotationVersion'],
} as const satisfies TokenSchema;

/** Doc-level bulk annotations listing pin (plural, vs the per-page
 *  `annotationVersion` token above). */
export const AnnotationsAllTokenSchema = {
  fields: ['annotationsVersion'],
} as const satisfies TokenSchema;

/** The form (`form@`): its fields, widget rows and calculation order. */
export const FormTokenSchema = {
  fields: ['formsVersion'],
} as const satisfies TokenSchema;

/**
 * `doc.annotations.export` leaf: the annotation and layout pins (the bundle
 * carries each page's position and box, which only the layout pin covers)
 * and the selection, canonical so one selection is one URL.
 */
export const AnnotationsExportTokenSchema = {
  fields: ['annotationsVersion', 'include', 'layoutVersion', 'selection'],
  maxLength: 4096,
} as const satisfies TokenSchema;

export const ActionsTokenSchema = {
  fields: ['actionsVersion'],
} as const satisfies TokenSchema;

export const AttachmentsTokenSchema = {
  fields: ['attachmentsVersion'],
} as const satisfies TokenSchema;

/**
 * Layer signature analysis: the working copy judged against the base,
 * pinned by `docVersion`; `since.signature` XOR `since.revision`; `level`
 * only in exploratory mode.
 */
export const AnalysisTokenSchema = {
  // `policy`: the judging policy version the caller expects — part of the
  // cache key, so a policy bump never serves a verdict judged under another
  // policy.
  fields: ['docVersion', 'since.signature', 'since.revision', 'level', 'policy', 'detail'],
} as const;

export const DownloadTokenSchema = {
  fields: ['docVersion', 'mode'],
  maxLength: 128,
} as const satisfies TokenSchema;

/**
 * Allowed flat keys for the render token, expressed as dotted paths that
 * mirror the SDK `PageImageOptions` shape 1:1. The token codec is fully
 * generic over this list — adding a new render option means adding its
 * dotted path here and a matching branch in `PageImageOptionsWireSchema`.
 * No encoder/decoder code changes.
 *
 * `includeAnnotations` is deliberately not a token field: annotatedness
 * changes the artifact's plane-dependency
 * set, so it is expressed by the path family (`…/render/pages/` vs
 * `…/render/annotated/pages/`), never inside the token. `annotationVersion`
 * belongs to the annotated family's tokens only — each family's query
 * schema enforces its own pin grammar. Form fields have no token field:
 * who may read the form isn't who may read the annotations, and a CDN grant
 * is a path prefix, so a picture with fields needs a path of its own. Cloud
 * pictures draw none until it has one.
 */
export const RenderTokenSchema = {
  fields: [
    'annotationVersion',
    'background',
    'contentVersion',
    'format',
    'quality',
    'rotation',
    'target.kind',
    'target.rect.height',
    'target.rect.width',
    'target.rect.x',
    'target.rect.y',
    'viewport.kind',
    'viewport.scale',
    'viewport.width',
  ],
  maxLength: 512,
} as const satisfies TokenSchema;

/**
 * Token for the versioned search endpoints (`/search/{rects,full}/data@…`).
 * One token carries the whole cache key: the content epoch, the query
 * (text/pattern rides base64-variant-encoded in `q` — the token value
 * charset excludes free text), and the resume position. Canonical by
 * construction: the codec sorts fields and the encoder omits every
 * default, so equal searches produce byte-equal tokens — the property CDN
 * cache hits live on. Mode is not a field; it is the endpoint (separate
 * permission tiers must never share cache entries).
 */
export const SearchTokenSchema = {
  fields: [
    'epoch',
    'format',
    'from',
    'ignoreWhitespace',
    'limitMatches',
    'limitPages',
    'matchCase',
    'matchDiacritics',
    'q',
    'regex',
    'skip',
    'wholeWord',
  ],
  maxLength: 2048,
} as const satisfies TokenSchema;

/**
 * Token for the batch annotation-appearance render endpoint. Narrower than
 * the page render token: appearance bitmaps are sized per annotation `/Rect`
 * so there is no target — only the page's `viewport` and `rotation`. Keyed by
 * `annotationVersion` only (appearances do not depend on page base content).
 * `modes` is present only when a request asks for fewer than every mode, as
 * one value (`normal-down`, in the engine's mode order), so one request for
 * every mode is one URL.
 */
export const AnnotationAppearancesRenderTokenSchema = {
  fields: [
    'annotationVersion',
    'format',
    'modes',
    'quality',
    'rotation',
    'viewport.kind',
    'viewport.scale',
    'viewport.width',
  ],
  maxLength: 256,
} as const satisfies TokenSchema;

/**
 * Token for a page's widget images (`form/pages/{p}/appearances@`): the
 * annotation appearance token's options, keyed by the page's
 * `widgetVersion`.
 */
export const WidgetAppearancesRenderTokenSchema = {
  fields: [
    'format',
    'modes',
    'quality',
    'rotation',
    'viewport.kind',
    'viewport.scale',
    'viewport.width',
    'widgetVersion',
  ],
  maxLength: 256,
} as const satisfies TokenSchema;
