/**
 * Single source of truth for cloud HTTP paths. Both @cloudpdf/engine and
 * @cloudpdf/server import these so they cannot drift.
 *
 * **URL layout convention (paths v2)**
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
 *   /v1/docs/{id}/text/pages/{N}/data@{ver}                  — text is its own prefix
 *   /v1/docs/{id}/geometry/pages/{N}/data@{ver}              — geometry is its own prefix
 *   /v1/docs/{id}/layers/{L}/manifest@{ver}
 *   /v1/docs/{id}/layers/{L}/metadata@{ver}
 *   /v1/docs/{id}/layers/{L}/render/pages/{N}/data@{ver}
 *   /v1/docs/{id}/layers/{L}/text/pages/{N}/data@{ver}
 *   /v1/docs/{id}/layers/{L}/geometry/pages/{N}/data@{ver}
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items@{ver}    — collection (read)
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items          — collection (create)
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items/{key}    — member
 *   /v1/docs/{id}/layers/{L}/annotations/pages/{N}/items/move     — batch reorder
 *   /v1/docs/{id}/layers/{L}/pages/move                           — batch page reorder
 *   /v1/docs/{id}/layers/{L}/pages/rotate                         — batch absolute rotation
 *   /v1/docs/{id}/layers/{L}/pages/delete                         — batch page delete
 *   /v1/docs/{id}/layers/{L}/form                                 — reconciled snapshot (read)
 *   /v1/docs/{id}/layers/{L}/form/fields                          — field collection (create)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}                    — field member (read/patch/delete)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/value              — value write (fill)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/reset              — reset to /DV (fill)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/widgets            — adopt a widget (attach)
 *   /v1/docs/{id}/layers/{L}/form/fields/{key}/widgets/detach     — release a widget
 *   /v1/docs/{id}/layers/{L}/form/data                            — FDF/XFDF export (GET) / import (POST)
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
  encodeAnnotationAppearancesRenderToken,
  encodeAnnotationToken,
  encodeAttachmentsToken,
  encodeContentToken,
  encodeDocToken,
  encodeDownloadToken,
  encodeLayoutToken,
  encodeMetadataToken,
  encodeRenderToken,
  encodeTokenText,
  type DownloadToken,
  type TokenInput,
} from './tokens';

export const DEFAULT_LAYER_NAME = 'default';

export const wirePaths = {
  /** POST: grant document access/caching credentials for the current bearer. */
  access: '/v1/access',

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
   * Immutable BASE page-geometry list (plane-scope model): the shared-URL
   * variant a layout-inheriting layer resolves at — every visitor's page
   * list is ONE CDN object served from the base worker session.
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

  /** Immutable BASE metadata (plane-scope model): the shared-URL variant a
   *  metadata-inheriting layer resolves at. */
  docMetadata: (docId: string, metadataVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/metadata@${encodeMetadataToken(metadataVersion)}`,

  /** Immutable catalog-owned actions, independently pinned in the manifest. */
  layerActions: (docId: string, layerName: string, actionsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/actions@${encodeActionsToken(actionsVersion)}`,

  /** Immutable BASE catalog actions (plane-scope model): the shared-URL
   *  variant an actions-inheriting layer resolves at. */
  docActions: (docId: string, actionsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/actions@${encodeActionsToken(actionsVersion)}`,

  /** POST: rewrite the document Info dict for the layer (metadata edit). */
  layerMetadataUpdate: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/metadata`,

  /**
   * Immutable BASE /EmbeddedFiles listing: the shared-URL variant an
   * attachments-undiverged layer resolves at — every visitor's sidebar list
   * is ONE CDN object served from the base worker session.
   */
  docAttachments: (docId: string, attachmentsVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/attachments@${encodeAttachmentsToken(attachmentsVersion)}`,

  /** Immutable BASE decoded bytes of one embedded file (twin of
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
    pageObjectNumber: number,
    annotKey: string,
    attachmentsVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/attachment-files/pages/${pageObjectNumber}/items/${encodeURIComponent(annotKey)}/data@${encodeAttachmentsToken(attachmentsVersion)}`,

  /**
   * Immutable BASE bytes of a FileAttachment annotation's embedded file
   * (plane-scope model). Depends on the `annotations` plane (the annotation
   * exists in this view) AND the `attachments` plane (the pin); the origin
   * guard requires both inherited.
   */
  docAnnotationFile: (
    docId: string,
    pageObjectNumber: number,
    annotKey: string,
    attachmentsVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/attachment-files/pages/${pageObjectNumber}/items/${encodeURIComponent(annotKey)}/data@${encodeAttachmentsToken(attachmentsVersion)}`,

  /**
   * GET: full plain-text extraction for a single page at a specific
   * `contentVersion`. Content-addressed; CDN may cache forever.
   * Stale-version requests return 404 and the SDK's transparent
   * retry walks `/head` → `/manifest@docVersion=N` to learn the new
   * `contentVersion`.
   */
  docPageText: (docId: string, pageObjectNumber: number, contentVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/text/pages/${pageObjectNumber}/data@${encodeContentToken(contentVersion)}`,

  layerPageText: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    contentVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/text/pages/${pageObjectNumber}/data@${encodeContentToken(contentVersion)}`,

  layerPageTextCurrent: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/text/pages/${pageObjectNumber}/data`,

  docPageGeometry: (docId: string, pageObjectNumber: number, contentVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/geometry/pages/${pageObjectNumber}/data@${encodeContentToken(contentVersion)}`,

  docPageGeometryCurrent: (docId: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/geometry/pages/${pageObjectNumber}/data`,

  docPageRender: (docId: string, pageObjectNumber: number, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/render/pages/${pageObjectNumber}/data@${encodeRenderToken(token)}`,

  docPageRenderCurrent: (docId: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/render/pages/${pageObjectNumber}/data`,

  /**
   * Immutable BASE annotated render (plane-scope model). Its OWN path family,
   * not a token flag under `/render/pages/`: an annotated render depends on
   * `content + annotations`, an annotation-free one on `content` alone, and
   * edge grants are prefix-scoped — the prefix law says a path's prefix must
   * identify its full plane-dependency set. Annotatedness is therefore
   * PATH-ONLY (the token/path law): the wire token has no
   * `includeAnnotations` key at all; the annotated family's token carries
   * `annotationVersion`, the free family's cannot.
   */
  docPageRenderAnnotated: (docId: string, pageObjectNumber: number, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/render/annotated/pages/${pageObjectNumber}/data@${encodeRenderToken(token)}`,

  layerPageGeometry: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    contentVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/geometry/pages/${pageObjectNumber}/data@${encodeContentToken(contentVersion)}`,

  layerPageGeometryCurrent: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/geometry/pages/${pageObjectNumber}/data`,

  layerPageRender: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    token: TokenInput,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/render/pages/${pageObjectNumber}/data@${encodeRenderToken(token)}`,

  layerPageRenderCurrent: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/render/pages/${pageObjectNumber}/data`,

  /** Layer twin of `docPageRenderAnnotated` — the grammar is uniform:
   *  annotatedness is path-only at BOTH tiers. */
  layerPageRenderAnnotated: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    token: TokenInput,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/render/annotated/pages/${pageObjectNumber}/data@${encodeRenderToken(token)}`,

  layerPageRenderAnnotatedCurrent: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/render/annotated/pages/${pageObjectNumber}/data`,

  /**
   * Immutable BASE annotation list for a single page (plane-scope model):
   * the shared-URL variant an annotations-inheriting layer resolves at — a
   * base's own annotations (weak-identity ones included) are simply visible
   * through every pristine layer, so 1,000 visitors' sidebars are ONE CDN
   * object served from the base worker session.
   */
  docPageAnnotations: (docId: string, pageObjectNumber: number, annotationVersion: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/annotations/pages/${pageObjectNumber}/items@${encodeAnnotationToken(annotationVersion)}`,

  /** Immutable BASE appearance batch (twin of
   *  `layerPageAnnotationAppearances` — same `annotations` plane gate). */
  docPageAnnotationAppearances: (docId: string, pageObjectNumber: number, token: TokenInput) =>
    `/v1/docs/${encodeURIComponent(docId)}/annotations/pages/${pageObjectNumber}/appearances@${encodeAnnotationAppearancesRenderToken(token)}`,

  /**
   * GET: full annotation list for a single page at a specific
   * `annotationVersion`. Same cache-control rules and 404-retry
   * semantics as `docPageText`. The `items` suffix is the
   * collection name — see file-level docstring.
   */
  layerPageAnnotations: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    annotationVersion: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/items@${encodeAnnotationToken(annotationVersion)}`,

  layerPageAnnotationsCurrent: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/items`,

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
   * deliberately NOT part of the key.
   */
  layerPageAnnotationAppearances: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
    token: TokenInput,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/appearances@${encodeAnnotationAppearancesRenderToken(token)}`,

  layerPageAnnotationAppearancesCurrent: (
    docId: string,
    layerName: string,
    pageObjectNumber: number,
  ) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/appearances`,

  layerPageAnnotationsCreate: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/items`,

  layerAnnotationByKey: (docId: string, layerName: string, pageObjectNumber: number, key: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/items/${encodeURIComponent(key)}`,

  layerPageAnnotationsMove: (docId: string, layerName: string, pageObjectNumber: number) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/annotations/pages/${pageObjectNumber}/items/move`,

  /**
   * GET: the reconciled form snapshot (field tree + widget joins) for the
   * layer's CURRENT state. Forms are document-scoped (one AcroForm per
   * document), so there is no per-page collection and — unlike annotations —
   * no content-addressed `@version` variant: the snapshot is always served
   * `no-store`. Mutation results carry the per-page `cacheDelta` that keeps
   * annotation/render caches coherent when widget appearances change.
   */
  layerForm: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form`,

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

  /** POST: reset the field to /DV (or clear). Empty body. */
  layerFormFieldReset: (docId: string, layerName: string, fieldKey: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/fields/${encodeURIComponent(fieldKey)}/reset`,

  /** POST: adopt an inert widget annotation (`{ widget, onState? }`). */
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

  /**
   * GET: serialized form data (`?format=fdf|xfdf`, default `xfdf`).
   * POST: import an FDF/XFDF payload (raw bytes body; format sniffed
   * server-side unless `?format=` pins it).
   */
  layerFormData: (docId: string, layerName: string, format?: 'fdf' | 'xfdf') =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/data${format ? `?format=${format}` : ''}`,

  /** POST: durable reconciliation (`{ bakeAppearances? }`). */
  layerFormRepair: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/repair`,

  layerFormEffects: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/form/effects`,

  /**
   * GET: one budgeted search slice, versioned form. The token
   * (`encodeSearchToken`) IS the cache key: content epoch + query +
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
   * plain text), served from the CURRENT content, always `no-store`.
   * The debug/simple-client variant; the SDK uses the versioned form.
   */
  layerSearchRectsCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/search/rects/data`,

  layerSearchFullCurrent: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/search/full/data`,

  layerPagesMove: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/move`,

  layerPagesRotate: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/rotate`,

  layerPagesDelete: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/delete`,

  layerPagesFlatten: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/flatten`,

  /**
   * POST (multipart mutation envelope): copy every page of the `source`
   * resource part (a standalone PDF) in at the body's `destIndex`.
   */
  layerPagesInsert: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/insert`,

  /** POST (plain JSON): create blank pages — pages.insert minus the bytes. */
  layerPagesInsertBlank: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/pages/insert-blank`,

  /**
   * POST (plain JSON → `application/pdf` bytes): export the listed pages,
   * in caller order, as a standalone PDF. A READ over the current layer
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
   * Weak-annotation-sessions: pluralized in v2 so the collection
   * lives at `/weak-annotation-sessions` and members at
   * `/weak-annotation-sessions/{sessionId}` — REST-conventional.
   */
  layerWeakAnnotationSession: (docId: string, layerName: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/weak-annotation-sessions`,

  layerWeakAnnotationSessionHeartbeat: (docId: string, layerName: string, sessionId: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/weak-annotation-sessions/${encodeURIComponent(sessionId)}/heartbeat`,

  layerWeakAnnotationSessionPages: (docId: string, layerName: string, sessionId: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/weak-annotation-sessions/${encodeURIComponent(sessionId)}/pages`,

  layerWeakAnnotationSessionRelease: (docId: string, layerName: string, sessionId: string) =>
    `/v1/docs/${encodeURIComponent(docId)}/layers/${encodeURIComponent(layerName)}/weak-annotation-sessions/${encodeURIComponent(sessionId)}`,

  /**
   * POST: pre-warm the doc cache + worker open before any user
   * request lands. Body is `{ docId }`. Doc-scoped token required.
   */
  docWarm: '/v1/warm',
} as const;

/**
 * Fastify-style templates for the PLAIN (unversioned) doc-plane routes —
 * the backend-callable subset that the `@cloudpdf/contract` contract
 * documents. The immutable `@{version}` variants above remain viewer
 * protocol and are deliberately absent. These templates are the single
 * statement of those paths: the contract package imports them, and the
 * server's route table is pinned to them by the doc-plane registry
 * conformance test.
 */
export const wireTemplates = {
  docHead: '/v1/docs/:docId/head',
  layerManifest: '/v1/docs/:docId/layers/:layerName/manifest',
  layerMetadata: '/v1/docs/:docId/layers/:layerName/metadata',
  layerRenderPage: '/v1/docs/:docId/layers/:layerName/render/pages/:pon/data',
  layerTextPage: '/v1/docs/:docId/layers/:layerName/text/pages/:pon/data',
  layerAnnotationItems: '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items',
  layerAnnotationItem: '/v1/docs/:docId/layers/:layerName/annotations/pages/:pon/items/:annotKey',
  layerForm: '/v1/docs/:docId/layers/:layerName/form',
  layerFormFieldValue: '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/value',
  layerFormFieldReset: '/v1/docs/:docId/layers/:layerName/form/fields/:fieldKey/reset',
  layerFormData: '/v1/docs/:docId/layers/:layerName/form/data',
  layerPagesMove: '/v1/docs/:docId/layers/:layerName/pages/move',
  layerPagesRotate: '/v1/docs/:docId/layers/:layerName/pages/rotate',
  layerPagesDelete: '/v1/docs/:docId/layers/:layerName/pages/delete',
  layerPagesFlatten: '/v1/docs/:docId/layers/:layerName/pages/flatten',
  layerPagesInsert: '/v1/docs/:docId/layers/:layerName/pages/insert',
  layerPagesInsertBlank: '/v1/docs/:docId/layers/:layerName/pages/insert-blank',
  layerPagesExtract: '/v1/docs/:docId/layers/:layerName/pages/extract',
  layerRedactionsApply: '/v1/docs/:docId/layers/:layerName/redactions/apply',
  layerDownload: '/v1/docs/:docId/layers/:layerName/download',
} as const;
