import type { AnnotationBundle } from './AnnotationBundle';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * How large an annotation bundle may be. One set applies wherever a bundle
 * is made or read, so whatever an export makes, an import accepts. Sizes are
 * measured on the bundle itself, never on a file or request carrying it: the
 * manifest (its pages and items as JSON) plus each resource's bytes.
 */
export interface AnnotationBundleLimits {
  /** The manifest's bytes plus every resource's bytes. */
  readonly bundleBytes: number;
  /** The pages and items, as UTF-8 JSON. */
  readonly manifestBytes: number;
  readonly items: number;
  readonly pages: number;
  readonly resources: number;
  readonly resourceBytes: number;
  /** Width times height of a PNG or JPEG resource, once decoded. */
  readonly imagePixels: number;
}

export const DEFAULT_ANNOTATION_BUNDLE_LIMITS: AnnotationBundleLimits = Object.freeze({
  bundleBytes: 50 * 1024 * 1024,
  manifestBytes: 16 * 1024 * 1024,
  items: 10_000,
  pages: 2_000,
  resources: 2_000,
  resourceBytes: 50 * 1024 * 1024,
  imagePixels: 40_000_000,
});

/** The bytes of a bundle's manifest: its pages and items as UTF-8 JSON. */
export function manifestBytesOf(bundle: Pick<AnnotationBundle, 'pages' | 'items'>): number {
  return new TextEncoder().encode(JSON.stringify({ pages: bundle.pages, items: bundle.items }))
    .length;
}

/** Refuse `value` when it is past the limit named `limit`. */
export function assertWithinLimit(
  limits: AnnotationBundleLimits,
  limit: keyof AnnotationBundleLimits,
  value: number,
): void {
  const max = limits[limit];
  if (value <= max) return;
  throw new EngineError(
    EngineErrorCode.PayloadTooLarge,
    `the annotation bundle is past its ${limit} limit: ${value} > ${max}`,
    { details: { limit, max, value } },
  );
}
