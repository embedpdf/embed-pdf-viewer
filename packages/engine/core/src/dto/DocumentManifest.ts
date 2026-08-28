import type { CachePins } from './CachePins';
import type { LayerScopes } from './LayerScopes';
import type { PageState } from '../revision/PageState';

/**
 * Per-page envelope inside `DocumentManifest`.
 *
 * `state` is universal document/page state; `cache` is the cloud/CDN read
 * coordinate for immutable leaf URLs.
 */
export interface ManifestPage {
  state: PageState;
  cache: CachePins;
}

/**
 * Versioned document/layer manifest. `docVersion` addresses the manifest
 * itself; each page row addresses its own immutable leaf URLs.
 *
 * `layoutVersion` is the doc-level version pointer for the page-geometry
 * resource (`/layout@layoutVersion`). It bumps only on structural page ops
 * (move/insert/delete/rotate), NOT on annotation or content edits — a
 * different cadence than `docVersion`. The layout bytes themselves are NOT
 * in the manifest; only this pointer is, mirroring how per-page
 * `cache.contentVersion` points at the immutable text/render leaves.
 *
 * `metadataVersion` is the doc-level version pointer for the document
 * metadata resource (`/metadata@metadataVersion`). It bumps only on
 * metadata writes (Info-dict edits), NOT on page or annotation edits —
 * the same independent-cadence design as `layoutVersion`, so each CDN
 * leaf only invalidates when its own bytes change.
 */
export interface DocumentManifest {
  docVersion: number;
  layoutVersion: number;
  metadataVersion: number;
  /** Catalog action resource pin. Derived as 1 until action writing exists. */
  actionsVersion: number;
  /**
   * Doc-level pin for the immutable `/attachments@…` listing and
   * `/attachment-files/…@…` byte leaves. Bumps only on attachment
   * create/delete — a different cadence than `docVersion`, so attachment
   * caches stay warm across unrelated edits (the `layoutVersion` design).
   */
  attachmentsVersion: number;
  /**
   * Doc-level pin for the immutable whole-document annotation listing
   * (`/annotations/items@annotationsVersion=N`) — the cloud's one-request
   * hydration read. Bumps ONLY when annotation list BODIES change —
   * annotation create/update/delete/move, page insert/delete,
   * redaction-apply, flatten, and form field/widget structure — and
   * deliberately NOT on form value writes (widget DTOs carry no value;
   * only `/AP` rasters change, which the per-page `annotationVersion`
   * covers), metadata, attachments, or page move/rotate (bulk page order
   * is unspecified by contract). The same independent-cadence design as
   * `layoutVersion` / `metadataVersion`.
   */
  annotationsVersion: number;
  /**
   * Audit-log head at this manifest's state — written in the same
   * transaction as the version bumps, so an event subscriber that starts
   * from `auditHead` can never miss a mutation between manifest fetch and
   * stream open (the gapless-subscribe cursor).
   */
  auditHead: number;
  baseSha: string;
  /**
   * Plane scopes (layer manifests only; absent on base manifests and
   * on pre-plane servers = all-`'layer'`). Whole-layer by design — edge
   * grants are prefix-level — and DERIVED from the version counters at
   * every emission point, never stored. See {@link LayerScopes}.
   */
  scopes?: LayerScopes;
  pages: ManifestPage[];
}
