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
