/**
 * Per-page cache-busting integers embedded in immutable cloud/CDN leaf URLs.
 *
 * These are not page state. They are read coordinates for cacheable endpoints:
 * `/text` uses `contentVersion`; `/annotations` uses `annotationVersion`.
 */
export interface CachePins {
  contentVersion: number;
  annotationVersion: number;
}
