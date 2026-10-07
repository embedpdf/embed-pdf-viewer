import { flatten, type WireFlat } from './flatten';
import {
  encodeAnnotationAppearancesRenderToken,
  encodeAppearanceModes,
  encodeRenderToken,
} from './tokens';
import {
  appearanceModesOf,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceRenderOptions,
} from '../dto/AnnotationRender';
import type { PageImageOptions, PageRenderOptions } from '../dto/PageRender';

export interface RenderVersions {
  contentVersion: number;
  annotationVersion?: number;
}

/**
 * Project image render options plus cache versions into the flat wire shape
 * the render token encoder consumes. The output is a generic dotted-key map
 * (`viewport.kind`, `target.rect.x`, …) — the schema and codec never need
 * to know about specific option fields. Adding a new render option means
 * extending `PageImageOptions`, the render query schemas, and
 * `RenderTokenSchema.fields`; this function does not change.
 *
 * Token/path rule: tokens carry version pins and render
 * parameters; anything that changes the artifact's plane-dependency set is
 * path-expressed. Annotatedness changes the planes (`content` vs
 * `content + annotations`), so the wire map never carries
 * `includeAnnotations` — the caller picks the path family
 * (`…/render/pages/` vs `…/render/annotated/pages/`) and passes
 * `annotationVersion` iff it chose the annotated one. Contradictory states
 * are unrepresentable; each family's query schema enforces its own pin
 * grammar structurally.
 *
 * Semantic validation (viewport-kind invariants, per-family pin presence,
 * rect coherence) lives in `PageRenderQuerySchema` /
 * `PageRenderAnnotatedQuerySchema` and runs when the resulting URL is
 * decoded server-side. Round-tripping (flatten → encode → decode →
 * unflatten → schema parse) recovers the original SDK options.
 */
export function renderImageOptionsToWire(
  options: PageImageOptions,
  versions: RenderVersions,
): WireFlat {
  // Path-expressed, never token-expressed (see above). Form fields are a
  // parameter of the annotated family, encoded only when left out.
  const {
    includeAnnotations: _pathExpressed,
    includeFormFields,
    ...wireOptions
  } = options;
  const withoutFormFields = options.includeAnnotations !== false && includeFormFields === false;
  return flatten({
    ...wireOptions,
    ...(withoutFormFields ? { formFields: false } : {}),
    contentVersion: versions.contentVersion,
    ...(versions.annotationVersion !== undefined
      ? { annotationVersion: versions.annotationVersion }
      : {}),
  });
}

/**
 * Convenience: build the full encoded render token in one call. Equivalent
 * to `encodeRenderToken(renderImageOptionsToWire(options, versions))`.
 */
export function renderImageOptionsToToken(
  options: PageImageOptions,
  versions: RenderVersions,
): string {
  return encodeRenderToken(renderImageOptionsToWire(options, versions));
}

/**
 * Re-attach `includeAnnotations` onto the worker-side `PageRenderOptions`
 * shape. Pure shape transform; consumed by the server route after
 * `PageRenderQuerySchema` has produced the SDK-shaped options.
 */
export function pageRenderOptionsFromImageOptions(
  options: PageImageOptions,
  includeAnnotations: boolean,
): PageRenderOptions {
  return {
    ...(options.target ? { target: options.target } : {}),
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.background !== undefined ? { background: options.background } : {}),
    includeAnnotations,
    ...(options.includeFormFields === false ? { includeFormFields: false } : {}),
  };
}

/**
 * Cache version for the appearance render token. Appearances depend only on
 * the annotation `/AP` stream, so `annotationVersion` is the sole key —
 * deliberately not `contentVersion`.
 */
export interface AnnotationRenderVersion {
  annotationVersion: number;
}

/**
 * Project annotation-appearance image options plus the annotation version
 * into the flat wire shape the appearance render token encoder consumes.
 * Mirrors {@link renderImageOptionsToWire}.
 */
export function annotationAppearancesImageOptionsToWire(
  options: AnnotationAppearanceImageOptions,
  versions: AnnotationRenderVersion,
): WireFlat {
  // `modes` only when it asks for fewer than every mode, as one value, so
  // every request for all of them is one URL.
  const { modes, ...rest } = options;
  const asked = appearanceModesOf(modes);
  return flatten({
    ...rest,
    ...(asked ? { modes: encodeAppearanceModes(asked) } : {}),
    annotationVersion: versions.annotationVersion,
  });
}

/** Convenience: build the full encoded appearance render token in one call. */
export function annotationAppearancesImageOptionsToToken(
  options: AnnotationAppearanceImageOptions,
  versions: AnnotationRenderVersion,
): string {
  return encodeAnnotationAppearancesRenderToken(
    annotationAppearancesImageOptionsToWire(options, versions),
  );
}

/**
 * Strip image-encoding fields, leaving the worker-side
 * `AnnotationAppearanceRenderOptions`. Pure shape transform consumed by the
 * server route after `AnnotationAppearancesQuerySchema` produces the
 * SDK-shaped options.
 */
export function annotationRenderOptionsFromImageOptions(
  options: AnnotationAppearanceImageOptions,
): AnnotationAppearanceRenderOptions {
  return {
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.modes ? { modes: options.modes } : {}),
  };
}
