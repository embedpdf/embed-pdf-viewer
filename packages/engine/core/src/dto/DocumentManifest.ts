import type { CachePins } from './CachePins';
import type { LayerScopes } from './LayerScopes';
import type { PageRef } from '../identity/PageRef';
import type { DocumentProtection } from '../signature/types';

/**
 * Per-page envelope inside `DocumentManifest`: the page, and `cache`, the
 * cloud/CDN read coordinate for its immutable leaf URLs.
 */
export interface ManifestPage {
  page: PageRef;
  cache: CachePins;
}

/**
 * Versioned document/layer manifest. `docVersion` addresses the manifest
 * itself; each page row addresses its own immutable leaf URLs.
 *
 * `layoutVersion` is the doc-level version pointer for the page-geometry
 * resource (`/layout@layoutVersion`). It bumps only on structural page ops
 * (move/insert/delete/rotate), not on annotation or content edits — a
 * different cadence than `docVersion`. The layout bytes themselves are not
 * in the manifest; only this pointer is, mirroring how per-page
 * `cache.contentVersion` points at the immutable text/render leaves.
 *
 * `metadataVersion` is the doc-level version pointer for the document
 * metadata resource (`/metadata@metadataVersion`). It bumps only on
 * metadata writes (Info-dict edits), not on page or annotation edits —
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
   * hydration read. Bumps only when annotation list bodies change —
   * annotation create/update/delete/move, page insert/delete,
   * redaction-apply and flatten — and never on form writes: widgets are the
   * form's (`formsVersion`). Not on metadata, attachments, or page
   * move/rotate either (bulk page order is unspecified by contract). The
   * same independent-cadence design as `layoutVersion` / `metadataVersion`.
   */
  annotationsVersion: number;
  /**
   * Doc-level pin for the immutable form (`/form@formsVersion=N`): the
   * fields, every widget row, the calculation order. Bumps on every form
   * write (fills included, since a fill changes a widget's state or look),
   * on a stacking-order move, page insert/delete, flatten and redaction —
   * never on an annotation write.
   */
  formsVersion: number;
  /**
   * Audit-log head at this manifest's state — written in the same
   * transaction as the version bumps, so an event subscriber that starts
   * from `auditHead` can never miss a mutation between manifest fetch and
   * stream open (the gapless-subscribe cursor).
   */
  auditHead: number;
  baseSha: string;
  /**
   * The layer's write serial (`layers.current_version`; 0 for the base view
   * and for a never-written layer) — the `editsVersion` half of the
   * `DocumentVersionRef` a signing pins at `prepare` and checks at `complete`.
   */
  layerVersion: number;
  /**
   * An artifact exists: the layer holds edits not yet sealed into a base
   * version. After a signature publishes a version the layer is clean again
   * while `layerVersion` keeps counting, so this is the only honest signal.
   */
  working: boolean;
  /** Byte length of `baseSha`'s file — with the sha, the `BaseVersionInfo` a client signs. */
  baseByteLength: number;
  /**
   * Plane scopes (layer manifests only; absent on base manifests and
   * on pre-plane servers = all-`'layer'`). Whole-layer by design — edge
   * grants are prefix-level — and derived from the version counters at
   * every emission point, never stored. See {@link LayerScopes}.
   */
  scopes?: LayerScopes;
  /**
   * What the signatures in `baseSha` forbid from now on (`null` when the
   * version has none): the protection every capability check subtracts,
   * as the local engine's does. It belongs to the version's bytes, so it
   * changes only when a signature publishes a new version.
   */
  protection: DocumentProtection | null;
  pages: ManifestPage[];
}
