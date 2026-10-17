/**
 * Plane-scope block: a layer is a set of per-plane deltas
 * over the immutable base, and each plane is either inherited (`'base'` — no
 * delta; the layer's view of that plane is the base's view, so its reads
 * resolve at the shared doc-level URLs and execute on the base worker
 * session) or owned (`'layer'` — the first write to that plane transferred
 * ownership; reads resolve at the layer-scoped URLs).
 *
 * A read resolves at the doc-level path iff every plane it depends on is
 * inherited: text, geometry and the page-only picture depend on `content`;
 * each other picture on `content` plus the planes it draws
 * (`PAGE_RENDER_FAMILIES`); the form on `forms`; the full-document download
 * on all seven.
 *
 * Present on layer manifests only. Absent on base manifests (meaningless
 * there) and on pre-plane servers — consumers treat absence as all-`'layer'`
 * (never wrong, only unshared). Scopes are derived from the version counters,
 * never stored. A client reads them from the layer manifest, which it fetches
 * again when a pinned read comes back stale.
 */
export interface LayerScopes {
  /** Page content: every picture and tile, text, geometry — per-page
   *  `contentVersion` vs the base counterpart, plus page-set equality
   *  (insert/delete own it; move/rotate do not — artifacts are normalized). */
  content: 'base' | 'layer';
  /** Annotation lists and appearance batches, widgets excepted (and, with
   *  `content`, the pictures that draw annotations) — `annotationsVersion` and per-page
   *  `annotationVersion` vs the base counterpart plus page-set equality. A
   *  base's own annotations, inline ones included, are visible through an
   *  inheriting layer. */
  annotations: 'base' | 'layer';
  /** The form: fields and widget rows (`form@`), the widget images
   *  (`form/pages/`), and, with `content`, the pictures that draw form
   *  fields — `formsVersion` and per-page `widgetVersion` vs the
   *  base counterpart plus page-set equality. A layer that only fills owns
   *  this plane and inherits `annotations`. */
  forms: 'base' | 'layer';
  /** The /layout leaf (page order, geometry, rotation) — `layoutVersion`. */
  layout: 'base' | 'layer';
  /** The /attachments listing and /attachment-files byte leaves —
   *  `attachmentsVersion`. */
  attachments: 'base' | 'layer';
  /** The /metadata leaf — `metadataVersion`. */
  metadata: 'base' | 'layer';
  /** The /actions snapshot — `actionsVersion`. */
  actions: 'base' | 'layer';
}

/** One plane a resource read can depend on. */
export type LayerScopePlane = keyof LayerScopes;
