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

export const ActionsTokenSchema = {
  fields: ['actionsVersion'],
} as const satisfies TokenSchema;

export const AttachmentsTokenSchema = {
  fields: ['attachmentsVersion'],
} as const satisfies TokenSchema;

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
 * `includeAnnotations` is deliberately NOT a token field (token/path law,
 * SCALE-OUT §2b.2): annotatedness changes the artifact's plane-dependency
 * set, so it is expressed by the path FAMILY (`…/render/pages/` vs
 * `…/render/annotated/pages/`), never inside the token. `annotationVersion`
 * belongs to the annotated family's tokens only — each family's query
 * schema enforces its own pin grammar.
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
    'target.rect.bottom',
    'target.rect.left',
    'target.rect.right',
    'target.rect.top',
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
 * cache hits live on. Mode is NOT a field; it is the endpoint (separate
 * permission tiers must never share cache entries).
 */
export const SearchTokenSchema = {
  fields: [
    'epoch',
    'matchCase',
    'matchDiacritics',
    'maxMatches',
    'maxPages',
    'q',
    'regex',
    'skip',
    'startPage',
    'wholeWord',
  ],
  maxLength: 2048,
} as const satisfies TokenSchema;

/**
 * Token for the batch annotation-appearance render endpoint. Narrower than
 * the page render token: appearance bitmaps are sized per annotation `/Rect`
 * so there is no target/viewport — only a uniform `scale` and page
 * `rotation`. Keyed by `annotationVersion` only (appearances do not depend on
 * page base content). The cloud endpoint renders the Normal appearance only,
 * so `modes` is intentionally absent here (it is a worker/local-only option).
 */
export const AnnotationAppearancesRenderTokenSchema = {
  fields: ['annotationVersion', 'format', 'quality', 'rotation', 'scale'],
  maxLength: 256,
} as const satisfies TokenSchema;
