import { flatten, type WireFlat } from './flatten';
import {
  encodeAnnotationAppearancesRenderToken,
  encodeAppearanceModes,
  encodeRenderToken,
  encodeWidgetAppearancesRenderToken,
} from './tokens';
import {
  appearanceModesOf,
  type AnnotationAppearanceImageOptions,
  type AnnotationAppearanceRenderOptions,
} from '../dto/AnnotationRender';
import type { PageImageOptions, PageRenderOptions } from '../dto/PageRender';

/**
 * A picture's pins: `contentVersion`, the pins of what its family draws, and
 * the server's fonts it is drawn with (fallback fonts draw page text).
 */
export interface RenderVersions {
  contentVersion: number;
  annotationVersion?: number;
  widgetVersion?: number;
  serverFonts: string;
}

/**
 * Project image render options plus cache versions into the flat wire shape
 * the render token encoder consumes. The output is a generic dotted-key map
 * (`viewport.kind`, `target.rect.x`, …) — the schema and codec never need
 * to know about specific option fields. Adding a new render option means
 * extending `PageImageOptions`, the render query schemas, and
 * `RenderTokenSchema.fields`; this function does not change.
 *
 * What the picture draws, whether it's a thumbnail, and whether and at which
 * DPI it prints, is never in the token: the caller picks the picture's path
 * (`PAGE_RENDER_FAMILIES`, `PAGE_THUMBNAIL_FAMILIES`, `PAGE_PRINT_FAMILIES`)
 * and passes that family's pins.
 * Each family's query schema checks its own pins when the URL is decoded
 * server-side. Round-tripping (flatten → encode → decode → unflatten →
 * schema parse) recovers the original SDK options.
 */
export function renderImageOptionsToWire(
  options: PageImageOptions,
  versions: RenderVersions,
): WireFlat {
  const {
    includeAnnotations: _inThePath,
    includeFormFields: _alsoInThePath,
    usage,
    viewport,
    ...wireOptions
  } = options;
  // A print picture's size is its tier, and a thumbnail's is a thumbnail's:
  // both are their path too.
  const sized =
    usage === 'print' || viewport === undefined || viewport.kind === 'thumbnail'
      ? {}
      : { viewport };
  return flatten({ ...wireOptions, ...sized, ...versions });
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
 * The worker-side `PageRenderOptions` of a parsed picture request: the
 * render options, and what its family draws and whether it prints (stamped
 * by the picture's query schema). Pure shape transform; image encoding stays
 * out.
 */
export function pageRenderOptionsFromImageOptions(options: PageImageOptions): PageRenderOptions {
  return {
    ...(options.target ? { target: options.target } : {}),
    ...(options.viewport ? { viewport: options.viewport } : {}),
    ...(options.rotation !== undefined ? { rotation: options.rotation } : {}),
    ...(options.background !== undefined ? { background: options.background } : {}),
    includeAnnotations: options.includeAnnotations ?? false,
    includeFormFields: options.includeFormFields ?? false,
    ...(options.usage !== undefined ? { usage: options.usage } : {}),
  };
}

/**
 * Cache version for the appearance render token. Appearances depend only on
 * the annotation `/AP` stream, so `annotationVersion` is the sole key —
 * deliberately not `contentVersion`.
 */
export interface AnnotationRenderVersion {
  annotationVersion: number;
  serverFonts: string;
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
  return appearancesToWire(options, {
    annotationVersion: versions.annotationVersion,
    serverFonts: versions.serverFonts,
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
 * Cache version for the widget appearance token: a page's widget images
 * change exactly when its widgets do.
 */
export interface WidgetRenderVersion {
  widgetVersion: number;
  serverFonts: string;
}

/** The widget twin of {@link annotationAppearancesImageOptionsToWire}. */
export function widgetAppearancesImageOptionsToWire(
  options: AnnotationAppearanceImageOptions,
  versions: WidgetRenderVersion,
): WireFlat {
  return appearancesToWire(options, {
    widgetVersion: versions.widgetVersion,
    serverFonts: versions.serverFonts,
  });
}

/** The widget twin of {@link annotationAppearancesImageOptionsToToken}. */
export function widgetAppearancesImageOptionsToToken(
  options: AnnotationAppearanceImageOptions,
  versions: WidgetRenderVersion,
): string {
  return encodeWidgetAppearancesRenderToken(widgetAppearancesImageOptionsToWire(options, versions));
}

/**
 * Appearance options and a pin, flat. `modes` only when it asks for fewer
 * than every mode, as one value, so every request for all of them is one URL.
 */
function appearancesToWire(
  options: AnnotationAppearanceImageOptions,
  pin: Record<string, number | string>,
): WireFlat {
  const { modes, ...rest } = options;
  const asked = appearanceModesOf(modes);
  return flatten({
    ...rest,
    ...(asked ? { modes: encodeAppearanceModes(asked) } : {}),
    ...pin,
  });
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
