import type { TokenSchema } from './token';

export const DocTokenSchema = {
  fields: ['docVersion', 'engine', 'shape'],
} as const satisfies TokenSchema;

export const ContentTokenSchema = {
  fields: ['contentVersion', 'engine', 'shape'],
} as const satisfies TokenSchema;

export const LayoutTokenSchema = {
  fields: ['engine', 'layoutVersion', 'shape', 'viewportsVersion'],
} as const satisfies TokenSchema;

export const MetadataTokenSchema = {
  fields: ['engine', 'metadataVersion', 'shape'],
} as const satisfies TokenSchema;

export const AnnotationTokenSchema = {
  fields: ['annotationVersion', 'engine', 'shape'],
} as const satisfies TokenSchema;

/** Doc-level bulk annotations listing pin (plural, vs the per-page
 *  `annotationVersion` token above). */
export const AnnotationsAllTokenSchema = {
  fields: ['annotationsVersion', 'engine', 'shape'],
} as const satisfies TokenSchema;

/** The form (`form@`): its fields, widget rows and calculation order. */
export const FormTokenSchema = {
  fields: ['engine', 'formsVersion', 'shape'],
} as const satisfies TokenSchema;

/**
 * `doc.annotations.export` leaf: the annotation and layout pins (the bundle
 * carries each page's position and box, which only the layout pin covers)
 * and the selection, canonical so one selection is one URL.
 */
export const AnnotationsExportTokenSchema = {
  fields: ['annotationsVersion', 'engine', 'include', 'layoutVersion', 'selection', 'shape'],
  maxLength: 4096,
} as const satisfies TokenSchema;

export const FormExportTokenSchema = {
  fields: ['engine', 'formsVersion', 'layoutVersion', 'selection', 'shape'],
  maxLength: 4096,
} as const satisfies TokenSchema;

export const ActionsTokenSchema = {
  fields: ['actionsVersion', 'engine', 'shape'],
} as const satisfies TokenSchema;

export const AttachmentsTokenSchema = {
  fields: ['attachmentsVersion', 'engine', 'shape'],
} as const satisfies TokenSchema;

/**
 * The outline leaf: its own pin and the layout pin. The outline is read in
 * page space, so a page delete or a box change moves what it reads.
 */
export const OutlineTokenSchema = {
  fields: ['engine', 'layoutVersion', 'outlineVersion', 'shape'],
} as const satisfies TokenSchema;

/** The font list: its own pin. It lists the server's fonts too, which its engine value names. */
export const FontsTokenSchema = {
  fields: ['engine', 'fontsVersion', 'shape'],
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
  fields: [
    'docVersion',
    'engine',
    'since.signature',
    'since.revision',
    'level',
    'policy',
    'detail',
    'shape',
  ],
} as const;

export const DownloadTokenSchema = {
  fields: ['docVersion', 'engine', 'mode', 'shape'],
  maxLength: 128,
} as const satisfies TokenSchema;

/**
 * Allowed flat keys for the render token, expressed as dotted paths that
 * mirror the SDK `PageImageOptions` shape 1:1. The token codec is fully
 * generic over this list — adding a new render option means adding its
 * dotted path here and a matching branch in `PageImageOptionsWireSchema`.
 * No encoder/decoder code changes.
 *
 * What a picture draws (`includeAnnotations`, `includeFormFields`) is not a
 * token field: it's the picture's family, which is its path
 * (`PAGE_RENDER_FAMILIES`). Each family needs its own rights and depends on
 * its own planes, and a CDN grant is a path prefix. The pins are: every
 * family's `contentVersion`, and `annotationVersion` and `widgetVersion` in
 * the families that draw annotations and form fields; each family's query
 * schema refuses the others.
 */
export const RenderTokenSchema = {
  fields: [
    'annotationVersion',
    'background',
    'contentVersion',
    'engine',
    'format',
    'quality',
    'rotation',
    'shape',
    'target.kind',
    'target.rect.height',
    'target.rect.width',
    'target.rect.x',
    'target.rect.y',
    'viewport.kind',
    'viewport.scale',
    'viewport.width',
    'widgetVersion',
  ],
  maxLength: 512,
} as const satisfies TokenSchema;

/**
 * Token for the versioned search endpoints (`/search/{rects,full}/data@…`).
 * One token carries the whole cache key: the document's contents and layout
 * pins, the query
 * (text/pattern rides base64-variant-encoded in `q` — the token value
 * charset excludes free text), and the resume position. Canonical by
 * construction: the codec sorts fields and the encoder omits every
 * default, so equal searches produce byte-equal tokens — the property CDN
 * cache hits live on. Mode is not a field; it is the endpoint (separate
 * permission tiers must never share cache entries).
 */
export const SearchTokenSchema = {
  fields: [
    'contentsVersion',
    'engine',
    'from',
    'ignoreWhitespace',
    'layoutVersion',
    'limitMatches',
    'limitPages',
    'matchCase',
    'matchDiacritics',
    'q',
    'regex',
    'shape',
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
    'engine',
    'format',
    'modes',
    'quality',
    'rotation',
    'shape',
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
    'engine',
    'format',
    'modes',
    'quality',
    'rotation',
    'shape',
    'viewport.kind',
    'viewport.scale',
    'viewport.width',
    'widgetVersion',
  ],
  maxLength: 256,
} as const satisfies TokenSchema;
