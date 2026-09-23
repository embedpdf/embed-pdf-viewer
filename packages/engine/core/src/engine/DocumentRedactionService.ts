import type { RedactionApplyResult, RedactionApplyScope } from '../mutation/RedactionApplyResult';
import { AbortablePromise } from '../promise/AbortablePromise';

/**
 * The destructive half of the two-stage redaction model (ISO 32000-2
 * 12.5.6.23). Marking is annotation-plane work: a `redact` annotation rides
 * the normal create/update/delete verbs and destroys nothing. Applying —
 * this service — permanently removes the content under each marked region,
 * paints the configured overlay in its place, and removes the consumed
 * redact annotations along with any annotation intersecting the region.
 *
 * Trust boundary (deliberate, documented): on a layered document, apply
 * rewrites this layer's bytes only. The immutable base document still
 * contains the original content — byte-perfect original recovery is a
 * feature of the storage model, not a leak. Redacted content becomes truly
 * unrecoverable only in a full-rewrite export after apply. Callers must select
 * `download({ mode: 'rewrite' })` (or the corresponding file/cloud save mode)
 * before sharing the redacted PDF. The default incremental download preserves
 * the original content in prior revisions; apply does not change that default.
 * Surfaces that promise "permanent removal" must scope that promise to the
 * full-rewrite exported artifact.
 *
 * Applying is irreversible within the layer (no undo). Emits a
 * `redaction.applied` document event; content-scope raster invalidation and
 * search-corpus refresh ride the normal content-version machinery.
 */
export interface DocumentRedactionService {
  /**
   * Apply redactions in `scope`. Ordered batch verb: pages are processed
   * independently and a failed page is recorded in its item result rather
   * than throwing after the first native write; `unchanged` means the page
   * had no matching redact annotation. Returns no `meta` only when nothing
   * changed.
   */
  apply(scope: RedactionApplyScope): AbortablePromise<RedactionApplyResult>;
}
