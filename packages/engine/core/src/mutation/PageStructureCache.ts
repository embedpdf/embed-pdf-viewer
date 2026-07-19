/**
 * Cloud-only coherence pins returned by every page-STRUCTURE mutation (move,
 * rotate, delete) so a cached manifest can advance without a refetch. All
 * structure ops share one shape: they bump the manifest `docVersion` and the
 * geometry pointer `layoutVersion`, and touch no per-page content/annotation
 * pins — those caches stay warm. (Rotation is presentation metadata applied at
 * display time over normalized renders; move and delete change the page
 * arrangement, never a surviving page's bytes.)
 *
 * `previousDocVersion` makes the patch safe to apply: a client only advances
 * its cached manifest when it is exactly at that version, otherwise it
 * refreshes instead of manufacturing a mixed-version manifest. `null` on the
 * result for local engines (no manifest/CDN).
 */
export interface PageStructureCache {
  previousDocVersion: number;
  docVersion: number;
  layoutVersion: number;
}
