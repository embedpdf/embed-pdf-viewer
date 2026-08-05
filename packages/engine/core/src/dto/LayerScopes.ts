/**
 * Plane-scope block: a layer is a set of per-plane DELTAS
 * over the immutable base, and each plane is either inherited (`'base'` — no
 * delta; the layer's view of that plane IS the base's view, so its reads
 * resolve at the shared doc-level URLs and execute on the base worker
 * session) or owned (`'layer'` — the first write to that plane transferred
 * ownership; reads resolve at the layer-scoped URLs).
 *
 * A read resolves at the doc-level path iff EVERY plane it depends on is
 * inherited: annotation-free renders/text/geometry depend on `content`;
 * annotated renders on `content + annotations`; the full-document download on
 * all six.
 *
 * Present on LAYER manifests only. Absent on base manifests (meaningless
 * there) and on pre-plane servers — consumers treat absence as all-`'layer'`
 * (never wrong, only unshared). Scopes are DERIVED from the version counters,
 * never stored, and ride every envelope that carries cache pins (manifest,
 * mutation deltas, SSE rows) so a live client can never lose them.
 */
export interface LayerScopes {
  /** Annotation-free renders/tiles, text, geometry — per-page
   *  `contentVersion` vs the base counterpart, plus page-SET equality
   *  (insert/delete own it; move/rotate do NOT — artifacts are normalized). */
  content: 'base' | 'layer';
  /** Annotation lists and appearance batches (and, with `content`,
   *  annotated renders) — per-page `annotationVersion` vs the base
   *  counterpart plus page-SET equality. A base's own annotations,
   *  weak-identity ones included, are visible through an inheriting layer. */
  annotations: 'base' | 'layer';
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
