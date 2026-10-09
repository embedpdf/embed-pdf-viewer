import { encodePageKey, type PageRef } from '../identity/PageRef';
import type { ModificationLevel } from '../signature/types';
import { SIGNATURE_POLICY_VERSION } from '../signature/protection';
import { PAGE_RENDER_FAMILIES, type PageRenderFamily } from './renderFamilies';
import type { AnalysisToken, AnnotationsExportToken, FormExportToken } from './tokens';
/**
 * Single source of truth for cloud HTTP paths. Both @cloudpdf/engine and
 * @cloudpdf/server import these so they cannot drift.
 *
 * **URL layout convention**
 *
 * Each resource type lives at its own distinct path prefix. This
 * lets prefix-matching CDNs (Bunny, Cloud CDN, Azure FD) enforce
 * per-resource scope at the edge — a Bunny token signed at
 * `/v1/docs/{id}/render/pages/` can only authorize render bytes,
 * never text or annotations.
 *
 * Shape:
 *   /v1/docs/{id}                                       — doc root
 *   /v1/docs/{id}/manifest@{ver}                        — doc-level read
 *   /v1/docs/{id}/render/pages/{N}/data@{ver}                — render is its own prefix
 *   /v1/docs/{id}/render/{annotations,fields,all}/pages/{N}/data@{ver} — and each picture family
 *   /v1/docs/{id}/text/pages/{N}/data@{ver}                  — text is its own prefix
 *   /v1/docs/{id}/geometry/pages/{N}/data@{ver}              — geometry is its own prefix
 *   /v1/docs/{id}/layers/{L}/manifest@{ver}
 *   /v1/docs/{id}/layers/{L}/metadata@{ver}
 *   /v1/docs/{id}/layers/{L}/metadata/custom@{ver}                — the Info dict's own keys
 *   /v1/docs/{id}/layers/{L}/render/pages/{N}/data@{ver}
 *   /v1/docs/{id}/layers/{L}/text/pages/{N}/data@{ver}
 *   /v1/docs/{id}/layers/{L}/geometry/pages/{N}/data@{ver}
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items@{ver}    — collection (read)
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items          — collection (create)
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items/{key}    — member
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items/reorder  — stacking order
 *   /v1/docs/{id}/layers/{L}/pages/reorder                        — page order
 *   /v1/docs/{id}/layers/{L}/pages/rotate                         — batch absolute rotation
 *   /v1/docs/{id}/layers/{L}/pages/delete                         — batch page delete
 *   /v1/docs/{id}/form@{ver}                                      — the form: fields + widget rows (read)
 *   /v1/docs/{id}/form/pages/{N}/appearances@{ver}                — a page's widget images (read)
 *   /v1/docs/{id}/layers/{L}/form@{ver}
 *   /v1/docs/{id}/layers/{L}/form/pages/{N}/appearances@{ver}
 *   /v1/docs/{id}/layers/{L}/form                                 — the form, current (read)
 *   /v1/docs/{id}/layers/{L}/form/widgets/{N}/{key}               — a widget's place and look (patch)
 *   /v1/docs/{id}/layers/{L}/form/widgets/{N}/reorder             — the widgets' stacking order
 *   /v1/docs/{id}/layers/{L}/form/fields                          — field collection (create)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}                    — field member (read/patch/delete)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/value              — value write (fill)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/reset              — reset to /DV (fill)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/widgets            — adopt a widget (attach)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/widgets/detach     — release a widget
 *   /v1/docs/{id}/layers/{L}/form/export@{token}                  — form bundle export (GET)
 *   /v1/docs/{id}/layers/{L}/form/export                          — form bundle export by body (POST)
 *   /v1/docs/{id}/layers/{L}/form/import                          — design import (multipart POST)
 *   /v1/docs/{id}/layers/{L}/form/import-values                   — values import (multipart POST)
 *   /v1/docs/{id}/layers/{L}/form/repair                          — durable reconciliation
 *   /v1/docs/{id}/layers/{L}/download@{ver}
 *
 * `items` appears on both the read collection (`items@{ver}`) and
 * the mutation surface (`items` POST, `items/{key}` PATCH/DELETE)
 * for symmetry — `items@version` is the page's versioned annotation
 * collection; `items/{key}` is one annotation inside it.
 */
import {
  encodeActionsToken,
  encodeAnalysisToken,
  encodeAnnotationAppearancesRenderToken,
  encodeAnnotationToken,
  encodeAnnotationsAllToken,
  encodeAnnotationsExportToken,
  encodeFormExportToken,
  encodeAttachmentsToken,
  encodeContentToken,
  encodeDocToken,
  encodeDownloadToken,
  encodeFormToken,
  encodeLayoutToken,
  encodeMetadataToken,
  encodeRenderToken,
  encodeTokenText,
  encodeWidgetAppearancesRenderToken,
  type DownloadToken,
  type TokenInput,
} from './tokens';

export const DEFAULT_LAYER_NAME = 'default';

export const wirePaths = {
  /**
   * POST: grant access/caching credentials for the current bearer on
   * the document + layer namespace the path names (cross-checked
   * against the token like every layer route — the grant is
   * layer-scoped in substance: CDN coverage, scopes, and the client's
   * binding all carry the layer). Path-addressed so the affinity tier —
   * the `X-CloudPDF-Doc` header derivation and the chart's uri-mode
   * regex — pins the session bootstrap to the document's pod from the
   * very first request. Default-layer callers spell `layers/default/`,
   * same as every other layer route.
   */
  access: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/access`,

  /** Deprecated alias (docId in the body) — served for one prerelease
   *  cycle so pre-rename clients keep working; remove after. */
  accessLegacy: '/v1/access',

  /**
   * POST `{ count }`: hand the caller's editing session `count` more object
   * numbers at once (at most 1,000), for a large paste.
   */
  objectNumbers: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/object-numbers`,

  /**
   * GET: open the document referenced by the doc-scoped JWT and
   * return its `DocumentHead`. The server materialises the base
   * PDF into its file cache and binds it to a worker the first
   * time this is hit.
   */
  docHead: (docId: string) => `/v1/docs/${encodeURIComponent(docId)}/head`,

  /**
   * GET: layer-scoped head. The cloud SDK always uses a layer namespace;
   * tokens without `layer_name` bind to `DEFAULT_LAYER_NAME`.
   */
  layerHead: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/head`,

  /**
   * GET: full document manifest at a specific `docVersion`. Content-
   * addressed: the URL bytes are immutable for the lifetime of the
   * version, so CDNs may cache `public, max-age=31536000, immutable`.
   * A request whose `docVersion` mismatches the current version
   * returns 404 — the SDK refetches `/head` to learn the new
   * version, then re-requests the manifest at the new URL.
   */
  docManifest: (docId: string, docVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/manifest@${encodeDocToken(docVersion)}`,

  /**
   * GET: full layer manifest at a specific layer document version.
   * Never-mutated layers may fall through to the immutable base view;
   * once a layer row exists, `layers.doc_version` and `layer_pages`
   * drive the response.
   */
  layerManifest: (docId: string, layerName: string, docVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/manifest@${encodeDocToken(docVersion)}`,

  /**
   * GET: page-geometry list for the whole layer at a specific
   * `layoutVersion`. Content-addressed; CDN may cache forever. The
   * `layoutVersion` lives in the manifest (doc-level pointer) and bumps
   * only on structural page ops. Stale-version requests 404 and the SDK's
   * transparent retry walks `/head` -> `/manifest@docVersion=N` to learn
   * the new `layoutVersion`.
   */
  layerLayout: (docId: string, layerName: string, layoutVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/layout@${encodeLayoutToken(layoutVersion)}`,

  /**
   * Immutable base page-geometry list (plane-scope model): the shared-URL
   * variant a layout-inheriting layer resolves at — every visitor's page
   * list is one CDN object served from the base worker session.
   */
  docLayout: (docId: string, layoutVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layout@${encodeLayoutToken(layoutVersion)}`,

  layerLayoutCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/layout`,

  /**
   * GET: full document metadata for the layer at a specific
   * `metadataVersion`. Content-addressed; CDN may cache forever. The
   * `metadataVersion` lives in the manifest (doc-level pointer) and bumps
   * only on metadata writes. Stale-version requests 404 and the SDK's
   * transparent retry walks `/head` -> `/manifest@docVersion=N` to learn
   * the new `metadataVersion`.
   */
  layerMetadata: (docId: string, layerName: string, metadataVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata@${encodeMetadataToken(metadataVersion)}`,

  layerMetadataCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata`,

  /** Immutable base metadata (plane-scope model): the shared-URL variant a
   *  metadata-inheriting layer resolves at. */
  docMetadata: (docId: string, metadataVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/metadata@${encodeMetadataToken(metadataVersion)}`,

  /**
   * GET: the Info dict's custom keys for the layer at a specific
   * `metadataVersion` — the same version pointer as `layerMetadata`, since
   * both halves live in one dict. Content-addressed like it.
   */
  layerCustomMetadata: (docId: string, layerName: string, metadataVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata/custom@${encodeMetadataToken(metadataVersion)}`,

  layerCustomMetadataCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata/custom`,

  /** Immutable base custom keys: the shared-URL twin of `layerCustomMetadata`. */
  docCustomMetadata: (docId: string, metadataVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/metadata/custom@${encodeMetadataToken(metadataVersion)}`,

  /** Immutable catalog-owned actions, independently pinned in the manifest. */
  layerActions: (docId: string, layerName: string, actionsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/actions@${encodeActionsToken(actionsVersion)}`,

  /** Immutable base catalog actions (plane-scope model): the shared-URL
   *  variant an actions-inheriting layer resolves at. */
  docActions: (docId: string, actionsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/actions@${encodeActionsToken(actionsVersion)}`,

  // ---------------------------------------------------------------------
  // Digital signatures. Layer reads pin `docVersion` (a signature is a
  // layer state change like any other edit); version-scoped reads are
  // content-addressed by the base sha and immutable forever. The resource
  // comes before the sha so each family keeps its own CDN prefix.
  // ---------------------------------------------------------------------

  /** Immutable layer signature snapshot (base signatures + the layer's fields + protection). */
  layerSignatures: (docId: string, layerName: string, docVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures@${encodeDocToken(docVersion)}`,
  layerSignaturesCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures`,
  /** Immutable: the layer's working copy judged against the base, pinned by `docVersion`. */
  layerSignaturesAnalysis: (docId: string, layerName: string, token: AnalysisToken) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures/analysis@${encodeAnalysisToken(token)}`,
  layerSignaturesAnalysisCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures/analysis`,
  /** POST (multipart envelope): author and seal a signing candidate. */
  layerSignaturesPrepare: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures/prepare`,
  /** POST (JSON): install the CMS and publish the sealed bytes as the next base version. */
  layerSignatureComplete: (docId: string, layerName: string, signingId: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures/${encodeURIComponent(signingId)}/complete`,
  /** DELETE: discard a pending signing. */
  layerSignatureCancel: (docId: string, layerName: string, signingId: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/signatures/${encodeURIComponent(signingId)}`,

  /** The document's base versions, oldest first (grows; never cached). */
  docVersions: (docId: string) => `/v1/docs/${encodeURIComponent(docId)}/versions`,
  /** Immutable: the signature snapshot of one base version. */
  docVersionSignatures: (docId: string, sha256: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/versions/signatures/${sha256}`,
  /** Immutable: a signed field's DER `/Contents` in one base version (`application/pkcs7-signature`). */
  docVersionSignatureContents: (docId: string, sha256: string, fieldName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/versions/signatures/${sha256}/${encodeTokenText(fieldName)}/contents`,
  /** Immutable: the digest of a signed field's `/ByteRange` in one base version. */
  docVersionSignatureDigest: (
    docId: string,
    sha256: string,
    fieldName: string,
    algorithm: 'sha1' | 'sha256' | 'sha384' | 'sha512',
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/versions/signatures/${sha256}/${encodeTokenText(fieldName)}/digest/${algorithm}`,
  /** Immutable: history between two revisions of one base version. */
  docVersionAnalysis: (docId: string, sha256: string, query: AnalysisQueryInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/versions/analysis/${sha256}?${analysisQueryString(query)}`,
  /** Immutable: the bytes of one base version. */
  docVersionDownload: (docId: string, sha256: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/versions/download/${sha256}`,
  /** Immutable: the byte prefix `[0, end)` of revision `index` of one base version. */
  docVersionRevision: (docId: string, sha256: string, index: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/versions/revisions/${sha256}/${index}`,

  /** POST (multipart envelope): draw a PDF page into an unsigned signature field's widgets. */
  layerFormFieldSignatureAppearance: (docId: string, layerName: string, fieldKey: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields/${encodeURIComponent(fieldKey)}/signature-appearance`,

  /** POST: rewrite the document Info dict for the layer (metadata edit). */
  layerMetadataUpdate: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata`,

  /** POST: set and remove the Info dict's custom keys for the layer. */
  layerCustomMetadataUpdate: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata/custom`,

  /**
   * Immutable base /EmbeddedFiles listing: the shared-URL variant an
   * attachments-undiverged layer resolves at — every visitor's sidebar list
   * is one CDN object served from the base worker session.
   */
  docAttachments: (docId: string, attachmentsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/attachments@${encodeAttachmentsToken(attachmentsVersion)}`,

  /** Immutable base decoded bytes of one embedded file (twin of
   *  `layerAttachmentFile` — same capability tier split). */
  docAttachmentFile: (docId: string, key: string, attachmentsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/attachment-files/${encodeTokenText(key)}/data@${encodeAttachmentsToken(attachmentsVersion)}`,

  /** Immutable /EmbeddedFiles listing, pinned by `attachmentsVersion`. */
  layerAttachments: (docId: string, layerName: string, attachmentsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/attachments@${encodeAttachmentsToken(attachmentsVersion)}`,

  /** POST: create a document-level embedded file (multipart mutation envelope). */
  layerAttachmentsCollection: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/attachments`,

  /** DELETE: remove a document-level embedded file by name-tree key. */
  layerAttachmentItem: (docId: string, layerName: string, key: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/attachments/${encodeTokenText(key)}`,

  /**
   * Immutable decoded bytes of one document-level embedded file. Lives
   * under its own `attachment-files` prefix — a stronger capability tier
   * than the metadata listing, so a CDN credential for one can never
   * authorize the other (the search-rects/search-full rule).
   */
  layerAttachmentFile: (
    docId: string,
    layerName: string,
    key: string,
    attachmentsVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/attachment-files/${encodeTokenText(key)}/data@${encodeAttachmentsToken(attachmentsVersion)}`,

  /** Immutable decoded bytes of a FileAttachment annotation's embedded file. */
  layerAnnotationFile: (
    docId: string,
    layerName: string,
    page: PageRef,
    annotKey: string,
    attachmentsVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/attachment-files/pages/${encodeURIComponent(encodePageKey(page))}/items/${encodeURIComponent(annotKey)}/data@${encodeAttachmentsToken(attachmentsVersion)}`,

  /**
   * Immutable base bytes of a FileAttachment annotation's embedded file
   * (plane-scope model). Depends on the `annotations` plane (the annotation
   * exists in this view) and the `attachments` plane (the pin); the origin
   * guard requires both inherited.
   */
  docAnnotationFile: (docId: string, page: PageRef, annotKey: string, attachmentsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/attachment-files/pages/${encodeURIComponent(encodePageKey(page))}/items/${encodeURIComponent(annotKey)}/data@${encodeAttachmentsToken(attachmentsVersion)}`,

  /**
   * GET: full plain-text extraction for a single page at a specific
   * `contentVersion`. Content-addressed; CDN may cache forever.
   * Stale-version requests return 404 and the SDK's transparent
   * retry walks `/head` → `/manifest@docVersion=N` to learn the new
   * `contentVersion`.
   */
  docPageText: (docId: string, page: PageRef, contentVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/text/pages/${encodeURIComponent(encodePageKey(page))}/data@${encodeContentToken(contentVersion)}`,

  layerPageText: (docId: string, layerName: string, page: PageRef, contentVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/text/pages/${encodeURIComponent(encodePageKey(page))}/data@${encodeContentToken(contentVersion)}`,

  layerPageTextCurrent: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/text/pages/${encodeURIComponent(encodePageKey(page))}/data`,

  docPageGeometry: (docId: string, page: PageRef, contentVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/geometry/pages/${encodeURIComponent(encodePageKey(page))}/data@${encodeContentToken(contentVersion)}`,

  docPageGeometryCurrent: (docId: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/geometry/pages/${encodeURIComponent(encodePageKey(page))}/data`,

  /**
   * A page picture of one family (`PAGE_RENDER_FAMILIES`). The family is a
   * path of its own, never a token field: each depends on its own planes and
   * needs its own rights, and an edge grant sees only prefixes. Its token
   * carries the family's pins.
   */
  docPageRender: (docId: string, family: PageRenderFamily, page: PageRef, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/${PAGE_RENDER_FAMILIES[family].path}/${encodeURIComponent(encodePageKey(page))}/data@${encodeRenderToken(token)}`,

  docPageRenderCurrent: (docId: string, family: PageRenderFamily, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/${PAGE_RENDER_FAMILIES[family].path}/${encodeURIComponent(encodePageKey(page))}/data`,

  layerPageGeometry: (docId: string, layerName: string, page: PageRef, contentVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/geometry/pages/${encodeURIComponent(encodePageKey(page))}/data@${encodeContentToken(contentVersion)}`,

  layerPageGeometryCurrent: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/geometry/pages/${encodeURIComponent(encodePageKey(page))}/data`,

  layerPageRender: (
    docId: string,
    layerName: string,
    family: PageRenderFamily,
    page: PageRef,
    token: TokenInput,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/${PAGE_RENDER_FAMILIES[family].path}/${encodeURIComponent(encodePageKey(page))}/data@${encodeRenderToken(token)}`,

  layerPageRenderCurrent: (
    docId: string,
    layerName: string,
    family: PageRenderFamily,
    page: PageRef,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/${PAGE_RENDER_FAMILIES[family].path}/${encodeURIComponent(encodePageKey(page))}/data`,

  /**
   * Immutable base annotation list for a single page (plane-scope model):
   * the shared-URL variant an annotations-inheriting layer resolves at — a
   * base's own annotations (inline ones included) are simply visible
   * through every pristine layer, so 1,000 visitors' sidebars are one CDN
   * object served from the base worker session.
   */
  docPageAnnotations: (docId: string, page: PageRef, annotationVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items@${encodeAnnotationToken(annotationVersion)}`,

  /** Immutable base whole-document annotation listing (bulk hydration). */
  docAnnotationsAll: (docId: string, annotationsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/annotations/items@${encodeAnnotationsAllToken(annotationsVersion)}`,

  /** Immutable base appearance batch (twin of
   *  `layerPageAnnotationAppearances` — same `annotations` plane gate). */
  docPageAnnotationAppearances: (docId: string, page: PageRef, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/appearances@${encodeAnnotationAppearancesRenderToken(token)}`,

  /**
   * GET: full annotation list for a single page at a specific
   * `annotationVersion`. Same cache-control rules and 404-retry
   * semantics as `docPageText`. The `items` suffix is the
   * collection name — see file-level docstring.
   */
  layerPageAnnotations: (
    docId: string,
    layerName: string,
    page: PageRef,
    annotationVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items@${encodeAnnotationToken(annotationVersion)}`,

  /** Immutable base annotation export: a bundle as multipart, needing
   *  `doc.annotate.read` and `doc.download`. */
  docAnnotationsExport: (docId: string, token: AnnotationsExportToken) =>
    `/v1/docs/${encodeURIComponent(docId)}/annotations/export@${encodeAnnotationsExportToken(token)}`,

  /** Immutable layer annotation export (twin of `docAnnotationsExport`). */
  layerAnnotationsExport: (docId: string, layerName: string, token: AnnotationsExportToken) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/export@${encodeAnnotationsExportToken(token)}`,

  /**
   * A layer annotation export whose selection a URL can't carry (position
   * refs, long ref lists): a POST of the pins and the selection, not cached.
   */
  layerAnnotationsExportRequest: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/export`,

  /** A layer's changes: user actions, each its ops in one transaction, or an undo (`doc.apply`). */
  layerChanges: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/changes`,

  /** A bundle's annotations, created in the layer as one change (`doc.annotations.import`). */
  layerAnnotationsImport: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/import`,

  /** Immutable layer whole-document annotation listing (bulk hydration). */
  layerAnnotationsAll: (docId: string, layerName: string, annotationsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/items@${encodeAnnotationsAllToken(annotationsVersion)}`,

  layerPageAnnotationsCurrent: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items`,

  /**
   * GET: batch-rendered annotation appearance bitmaps for a single page as a
   * `multipart/form-data` body. Sibling collection of `items` under the same
   * `annotations/pages/{N}/` resource, so it shares the `annotations-read`
   * gate (`doc.annotate.read`) and CDN coverage — reading an annotation lets
   * you see its rendered appearance, the same boundary Adobe uses.
   *
   * Content-addressed via the appearance render token (`annotationVersion`
   * plus render options like scale/format); CDN may cache forever. Appearance
   * pixels depend only on the annotation `/AP` stream, so `contentVersion` is
   * deliberately not part of the key.
   */
  layerPageAnnotationAppearances: (
    docId: string,
    layerName: string,
    page: PageRef,
    token: TokenInput,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/appearances@${encodeAnnotationAppearancesRenderToken(token)}`,

  layerPageAnnotationAppearancesCurrent: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/appearances`,

  layerPageAnnotationsCreate: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items`,

  layerAnnotationByKey: (docId: string, layerName: string, page: PageRef, key: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items/${encodeURIComponent(key)}`,

  /** GET: an annotation's `appearance` resource, its drawing as a one-page
   *  PDF — a derived read (application/pdf, no-store), gated like pages/extract. */
  layerAnnotationAppearanceResource: (
    docId: string,
    layerName: string,
    page: PageRef,
    key: string,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items/${encodeURIComponent(key)}/resources/appearance`,

  layerPageAnnotationsReorder: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items/reorder`,
  /** POST: flatten a chosen set of the page's annotations into its content
   *  (a content + annotation mutation of that page). */
  layerPageAnnotationsFlatten: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items/flatten`,
  /** POST: the chosen annotations' appearances as one single-page PDF — a
   *  derived read (application/pdf, no-store), gated like pages/extract. */
  layerPageAnnotationsAppearance: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${encodeURIComponent(encodePageKey(page))}/items/appearance`,

  /**
   * Immutable base form: the fields, every widget row, the calculation
   * order (`doc.forms.list()`), at the document's `formsVersion`. Needs
   * `doc.forms.read`, under its own prefix, so the CDN signs it apart from
   * the annotations.
   */
  docForm: (docId: string, formsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/form@${encodeFormToken(formsVersion)}`,

  /** Immutable layer form (twin of `docForm`). */
  layerForm: (docId: string, layerName: string, formsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form@${encodeFormToken(formsVersion)}`,

  /** GET: the layer's form as it is now — for API callers, served `no-store`. */
  layerFormCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form`,

  /**
   * Immutable base batch of a page's widget images, every mode and state, as
   * `multipart/form-data` (`page.forms.renderAppearances()`), keyed by the
   * page's `widgetVersion`.
   */
  docPageFormAppearances: (docId: string, page: PageRef, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/form/pages/${encodeURIComponent(encodePageKey(page))}/appearances@${encodeWidgetAppearancesRenderToken(token)}`,

  /** Immutable layer twin of `docPageFormAppearances`. */
  layerPageFormAppearances: (docId: string, layerName: string, page: PageRef, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/pages/${encodeURIComponent(encodePageKey(page))}/appearances@${encodeWidgetAppearancesRenderToken(token)}`,

  layerPageFormAppearancesCurrent: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/pages/${encodeURIComponent(encodePageKey(page))}/appearances`,

  /**
   * PATCH: a widget's place and look (`doc.forms.updateWidget`). `key` is
   * the widget's annotation key. Not under `form/pages/`, which the CDN
   * signs for reads.
   */
  /** POST: the form's calculation order (`doc.forms.reorderCalculations`). */
  layerFormCalculationsReorder: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/calculations/reorder`,

  /** POST: the stacking order of a page's widgets (`doc.forms.reorderWidgets`). */
  layerFormWidgetsReorder: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/widgets/${encodeURIComponent(encodePageKey(page))}/reorder`,

  layerFormWidget: (docId: string, layerName: string, page: PageRef, key: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/widgets/${encodeURIComponent(encodePageKey(page))}/${encodeURIComponent(key)}`,

  /** POST: create a field (optionally with styled widget placements). */
  layerFormFields: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields`,

  /**
   * Field member: GET (single field) / PATCH (updateField) / DELETE
   * (deleteField + widget cascade). `fieldKey` is an encoded `FormFieldRef`
   * (`encodeFieldRefKey`): `obj:12` or `fqn:billing.name`.
   */
  layerFormFieldByKey: (docId: string, layerName: string, fieldKey: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields/${encodeURIComponent(fieldKey)}`,

  /** POST: replace the field's value (`{ value: FormFieldValue }`). */
  layerFormFieldValue: (docId: string, layerName: string, fieldKey: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields/${encodeURIComponent(fieldKey)}/value`,

  /** POST: reset fields to /DV (or clear): `{ refs? }`, the whole form without `refs`. */
  layerFormReset: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/reset`,

  /** POST: add a widget to the field, the body its placement (`WidgetPlacement`). */
  layerFormFieldWidgets: (docId: string, layerName: string, fieldKey: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields/${encodeURIComponent(fieldKey)}/widgets`,

  /**
   * POST: release a widget back to the inert annotation plane
   * (`{ widget }`). An action POST rather than a member DELETE because a
   * widget ref is a (page, annotation) pair — carrying it in the body keeps
   * one codec instead of inventing a second composite key syntax.
   */
  layerFormFieldWidgetsDetach: (docId: string, layerName: string, fieldKey: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields/${encodeURIComponent(fieldKey)}/widgets/detach`,

  /** Immutable base form export: a bundle as multipart, needing `doc.forms.read` and `doc.download`. */
  docFormExport: (docId: string, token: FormExportToken) =>
    `/v1/docs/${encodeURIComponent(docId)}/form/export@${encodeFormExportToken(token)}`,

  /** Immutable layer form export (twin of `docFormExport`). */
  layerFormExport: (docId: string, layerName: string, token: FormExportToken) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/export@${encodeFormExportToken(token)}`,

  /** A layer form export whose selection a URL can't carry: a POST of the pins and the selection, not cached. */
  layerFormExportRequest: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/export`,

  /** A bundle's design, created in the layer as one change (`doc.forms.import`). */
  layerFormImport: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/import`,

  /** A bundle's values, written in the layer as one change (`doc.forms.importValues`). */
  layerFormImportValues: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/import-values`,

  /** POST: durable reconciliation (`{ bakeAppearances? }`). */
  layerFormRepair: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/repair`,

  layerFormEffects: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/effects`,

  /**
   * GET: one budgeted search slice, versioned form. The token
   * (`encodeSearchToken`) is the cache key: content epoch + query +
   * position. Immutable; CDN may cache forever. Mode is the path — rects
   * and full are separate resources so permission tiers never share
   * cache entries (`'rects'` needs `doc.text.search`; `'full'` also
   * needs `doc.text.copy`).
   */
  layerSearchRects: (docId: string, layerName: string, token: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/search/rects/data@${token}`,

  layerSearchFull: (docId: string, layerName: string, token: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/search/full/data@${token}`,

  /**
   * GET: unversioned form — same fields as flat query params (`q` as
   * plain text), served from the current content, always `no-store`.
   * The debug/simple-client variant; the SDK uses the versioned form.
   */
  layerSearchRectsCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/search/rects/data`,

  layerSearchFullCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/search/full/data`,

  layerPageViewports: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/${encodeURIComponent(encodePageKey(page))}/viewports`,
  layerPageScale: (docId: string, layerName: string, page: PageRef) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/${encodeURIComponent(encodePageKey(page))}/scale`,

  layerPagesReorder: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/reorder`,

  layerPagesRotate: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/rotate`,

  layerPagesDelete: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/delete`,
  /** POST: register/rename a `/Names /Pages` entry — a page-structure
   *  mutation (docVersion + layoutVersion advance; reads ride `/layout`). */
  layerPagesNames: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/names`,
  /** POST: remove a `/Names /Pages` entry (the page stays). */
  layerPagesNamesDelete: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/names/delete`,

  layerPagesFlatten: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/flatten`,

  /**
   * POST (multipart mutation envelope): copy every page of the `source`
   * resource part (a standalone PDF) in at the body's `toIndex`.
   */
  layerPagesInsert: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/insert`,

  /** POST (plain JSON): create blank pages — pages.insert minus the bytes. */
  layerPagesInsertBlank: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/insert-blank`,

  /**
   * POST (plain JSON → `application/pdf` bytes): export the listed pages,
   * in caller order, as a standalone PDF. A read over the current layer
   * state (gated like /download), so it is a POST only for its body —
   * nothing mutates and no event is published.
   */
  layerPagesExtract: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/extract`,

  layerRedactionsApply: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/redactions/apply`,

  layerEvents: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/events`,

  layerDownload: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/download`,

  layerDownloadVersioned: (docId: string, layerName: string, token: DownloadToken) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/download@${encodeDownloadToken(token)}`,

  /**
   * POST: pre-warm the doc cache + worker open before any user
   * request lands. Body is `{ docId }`. Doc-scoped token required.
   */
  docWarm: '/v1/warm',
} as const;

/**
 * Fastify-style templates for the plain (unversioned) doc-plane routes —
 * the backend-callable subset that the `@cloudpdf/contract` contract
 * documents. The immutable `@{version}` variants above remain viewer
 * protocol and are deliberately absent. These templates are the single
 * statement of those paths: the contract package imports them, and the
 * server's route table is pinned to them by the doc-plane registry
 * conformance test.
 */
/** The flat query of a version analysis (the contract's dotted keys). */
export interface AnalysisQueryInput {
  since: { signatureIndex: number } | { revisionIndex: number };
  /** Revision index the analysis ends at; default the last. */
  until?: number;
  exploratoryLevel?: ModificationLevel;
  detail?: 'summary' | 'full';
}

export function analysisQueryString(query: AnalysisQueryInput): string {
  const params = new URLSearchParams();
  if ('signatureIndex' in query.since)
    params.set('since.signature', String(query.since.signatureIndex));
  else params.set('since.revision', String(query.since.revisionIndex));
  if (query.until !== undefined) params.set('until', String(query.until));
  if (query.exploratoryLevel !== undefined) params.set('level', query.exploratoryLevel);
  if (query.detail !== undefined) params.set('detail', query.detail);
  // The judging policy version: a cache key on the immutable version URL, so
  // a policy bump never serves a verdict judged under another policy.
  params.set('policy', String(SIGNATURE_POLICY_VERSION));
  return params.toString();
}

export const wireTemplates = {
  docHead: '/v1/docs/:docId/head',
  layerManifest: '/v1/docs/:docId/layers/:layerName/manifest',
  layerChanges: '/v1/docs/:docId/layers/:layerName/changes',
  layerMetadata: '/v1/docs/:docId/layers/:layerName/metadata',
  layerCustomMetadata: '/v1/docs/:docId/layers/:layerName/metadata/custom',
  layerRenderPage: '/v1/docs/:docId/layers/:layerName/render/pages/:pageKey/data',
  layerTextPage: '/v1/docs/:docId/layers/:layerName/text/pages/:pageKey/data',
  layerAnnotationItemsAll: '/v1/docs/:docId/layers/:layerName/annotations/items',
  layerAnnotationItems: '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items',
  layerAnnotationItem:
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/:annotKey',
  layerAnnotationItemsReorder:
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/reorder',
  layerAnnotationItemsFlatten:
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/flatten',
  layerAnnotationItemsAppearance:
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/appearance',
  layerAnnotationItemAppearanceResource:
    '/v1/docs/:docId/layers/:layerName/annotations/pages/:pageKey/items/:annotKey/resources/appearance',
  layerForm: '/v1/docs/:docId/layers/:layerName/form',
  layerFormWidget: '/v1/docs/:docId/layers/:layerName/form/widgets/:pageKey/:annotKey',
  layerFormWidgetsReorder: '/v1/docs/:docId/layers/:layerName/form/widgets/:pageKey/reorder',
  layerFormCalculationsReorder: '/v1/docs/:docId/layers/:layerName/form/calculations/reorder',
  layerFormFieldValue: '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/value',
  layerFormReset: '/v1/docs/:docId/layers/:layerName/form/reset',
  layerFormFieldSignatureAppearance:
    '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/signature-appearance',
  layerFormImport: '/v1/docs/:docId/layers/:layerName/form/import',
  layerFormImportValues: '/v1/docs/:docId/layers/:layerName/form/import-values',
  layerPageViewports: '/v1/docs/:docId/layers/:layerName/pages/:pageKey/viewports',
  layerPageScale: '/v1/docs/:docId/layers/:layerName/pages/:pageKey/scale',
  layerPagesReorder: '/v1/docs/:docId/layers/:layerName/pages/reorder',
  layerPagesRotate: '/v1/docs/:docId/layers/:layerName/pages/rotate',
  layerPagesDelete: '/v1/docs/:docId/layers/:layerName/pages/delete',
  layerPagesNames: '/v1/docs/:docId/layers/:layerName/pages/names',
  layerPagesNamesDelete: '/v1/docs/:docId/layers/:layerName/pages/names/delete',
  layerPagesFlatten: '/v1/docs/:docId/layers/:layerName/pages/flatten',
  layerPagesInsert: '/v1/docs/:docId/layers/:layerName/pages/insert',
  layerPagesInsertBlank: '/v1/docs/:docId/layers/:layerName/pages/insert-blank',
  layerPagesExtract: '/v1/docs/:docId/layers/:layerName/pages/extract',
  layerRedactionsApply: '/v1/docs/:docId/layers/:layerName/redactions/apply',
  layerDownload: '/v1/docs/:docId/layers/:layerName/download',
  layerSignatures: '/v1/docs/:docId/layers/:layerName/signatures',
  layerSignaturesAnalysis: '/v1/docs/:docId/layers/:layerName/signatures/analysis',
  layerSignaturesPrepare: '/v1/docs/:docId/layers/:layerName/signatures/prepare',
  layerSignatureComplete: '/v1/docs/:docId/layers/:layerName/signatures/:signingId/complete',
  layerSignatureCancel: '/v1/docs/:docId/layers/:layerName/signatures/:signingId',
  docVersions: '/v1/docs/:docId/versions',
  docVersionSignatures: '/v1/docs/:docId/versions/signatures/:sha',
  docVersionSignatureContents: '/v1/docs/:docId/versions/signatures/:sha/:fieldKey/contents',
  docVersionSignatureDigest: '/v1/docs/:docId/versions/signatures/:sha/:fieldKey/digest/:algorithm',
  docVersionAnalysis: '/v1/docs/:docId/versions/analysis/:sha',
  docVersionDownload: '/v1/docs/:docId/versions/download/:sha',
  docVersionRevision: '/v1/docs/:docId/versions/revisions/:sha/:index',
} as const;
