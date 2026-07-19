import { flatten, type WireFlat } from './flatten';
import { encodeAnnotationAppearancesRenderToken, encodeRenderToken } from './tokens';
import type {
  AnnotationAppearanceImageOptions,
  AnnotationAppearanceRenderOptions,
} from '../dto/AnnotationRender';
import type { PageImageOptions, PageRenderOptions } from '../dto/PageRender';

export interface RenderVersions {
  contentVersion: number;
  annotationVersion?: number;
}

/**
 * Project image render options plus cache versions into the flat wire shape
 * the render token encoder consumes. The output is a generic dotted-key map
 * (`viewport.kind`, `target.rect.left`, …) — the schema and codec never need
 * to know about specific option fields. Adding a new render option means
 * extending `PageImageOptions`, `PageRenderQuerySchema`, and
 * `RenderTokenSchema.fields`; this function does not change.
 *
 * Semantic validation (viewport-kind invariants, includeAnnotations /
 * annotationVersion consistency, rect coherence) lives in
 * `PageRenderQuerySchema` and runs when the resulting URL is decoded server-
 * side. Round-tripping (flatten → encode → decode → unflatten →
 * `PageRenderQuerySchema.parse`) recovers the original SDK options.
 */
export function renderImageOptionsToWire(
  options: PageImageOptions,
  versions: RenderVersions,
): WireFlat {
  const includeAnnotations = options.includeAnnotations ?? true;
  return flatten({
    ...options,
    includeAnnotations,
    contentVersion: versions.contentVersion,
    ...(includeAnnotations && versions.annotationVersion !== undefined
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
  };
}

/**
 * Cache version for the appearance render token. Appearances depend only on
 * the annotation `/AP` stream, so `annotationVersion` is the sole key —
 * deliberately NOT `contentVersion`.
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
  return flatten({
    ...options,
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
    ...(options.scale !== undefined ? { scale: options.scale } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.modes ? { modes: options.modes } : {}),
  };
}
