import type { CachePins } from '../dto/CachePins';
import type { PageObjectNumber } from '../identity/PageObjectNumber';
import type { PageState } from '../revision/PageState';

/**
 * Cache pin patch returned by cloud mutations after the durable DB transaction
 * commits.
 *
 * `previousDocVersion` makes partial page deltas safe: clients may apply the
 * patch only when their cached manifest is exactly at that version. Otherwise
 * they must refresh instead of manufacturing a mixed-version manifest.
 *
 * Deliberately does NOT carry plane scopes: scopes only ever move
 * base → layer, and each mutation kind knows exactly which planes it owns, so
 * the client flips them locally when absorbing this delta (the monotone-flip
 * rule); the manifest is the authoritative source and the 404 → refresh rail
 * the backstop.
 */
export interface CacheDelta {
  previousDocVersion: number;
  docVersion: number;
  pages: Array<{
    pageObjectNumber: PageObjectNumber;
    cache: CachePins;
  }>;
}

/**
 * Base envelope for every layer-mutating operation.
 *
 * `affectedPages` is the state delta. `cacheDelta` is the cloud/CDN URL pin
 * delta and is `null` for local engines.
 */
export interface MutationMeta {
  affectedPages: PageState[];
  cacheDelta: CacheDelta | null;
}
