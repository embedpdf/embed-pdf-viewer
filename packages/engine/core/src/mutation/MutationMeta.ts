import type { CachePins } from '../dto/CachePins';
import type { PageRef } from '../identity/PageRef';
import type { PageState } from '../revision/PageState';

/**
 * Cache pin patch returned by cloud mutations after the durable DB transaction
 * commits.
 *
 * `previousDocVersion` makes partial page deltas safe: clients may apply the
 * patch only when their cached manifest is exactly at that version. Otherwise
 * they must refresh instead of manufacturing a mixed-version manifest.
 *
 * Deliberately does not carry plane scopes: scopes only ever move
 * base → layer, and each mutation kind knows exactly which planes it owns, so
 * the client flips them locally when absorbing this delta (the monotone-flip
 * rule); the manifest is the authoritative source and the 404 → refresh rail
 * the backstop.
 */
export interface CacheDelta {
  previousDocVersion: number;
  docVersion: number;
  /**
   * New doc-level bulk annotations pin, present when this mutation bumped
   * it (annotation CRUD, page insert/delete, redaction, flatten, form
   * structure — see `DocumentManifest.annotationsVersion`). Absorbing it
   * keeps the client's cached manifest addressing the fresh bulk leaf
   * without a 404-refresh round trip.
   */
  annotationsVersion?: number;
  /**
   * New plane pins, present when this mutation bumped them: `layoutVersion`
   * for a page-structure write (move, rotate, delete, insert, names),
   * `metadataVersion` for a metadata write, `attachmentsVersion` for an
   * attachment write. Absorbing them re-points the cached manifest's leaf
   * without a refetch.
   */
  layoutVersion?: number;
  metadataVersion?: number;
  attachmentsVersion?: number;
  /**
   * The layer's write serial after this mutation and whether an artifact
   * now exists (cloud only). Absorbing them keeps the client's cached
   * manifest an honest `DocumentVersionRef` source between refreshes.
   */
  layerVersion?: number;
  working?: boolean;
  pages: Array<{
    page: PageRef;
    cache: CachePins;
  }>;
}

/**
 * Base envelope for every layer-mutating operation: the `meta` of every
 * write result.
 *
 * `affectedPages` is the state delta. `cacheDelta` is the cloud/CDN URL pin
 * delta and is `null` for local engines (and for a write that changed
 * nothing).
 */
export interface MutationMeta {
  affectedPages: PageState[];
  cacheDelta: CacheDelta | null;
}
