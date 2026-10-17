/**
 * Per-page cache-busting integers embedded in immutable cloud/CDN leaf URLs.
 *
 * These are not page state. They are read coordinates for cacheable endpoints,
 * one per read family: `/text` and plain renders use `contentVersion`; the
 * page's annotations (every annotation except widgets) use
 * `annotationVersion`; the page's widget images use `widgetVersion`.
 */
export interface CachePins {
  contentVersion: number;
  /** The page's annotations except widgets: their list and their images. */
  annotationVersion: number;
  /** The page's widgets: their images (`form/pages/{p}/appearances@`). */
  widgetVersion: number;
}
