import type { BundleKind } from './bundle';
import { EngineError } from '../errors/EngineError';
import { EngineErrorCode } from '../errors/EngineErrorCode';

/**
 * How large a bundle may be, annotations or a form. One set applies wherever
 * a bundle is made or read, so whatever an export makes, an import accepts.
 * Sizes are measured on the bundle itself, never on a file or request
 * carrying it: the manifest (its pages and rows as JSON) plus each
 * resource's bytes.
 */
export interface BundleLimits {
  /** The manifest's bytes plus every resource's bytes. */
  readonly bundleBytes: number;
  /** The pages and rows, as UTF-8 JSON. */
  readonly manifestBytes: number;
  /** The rows: an annotation bundle's items, a form bundle's fields and widgets. */
  readonly items: number;
  readonly pages: number;
  readonly resources: number;
  readonly resourceBytes: number;
  /** Width times height of a PNG or JPEG resource, once decoded. */
  readonly imagePixels: number;
}

export const DEFAULT_BUNDLE_LIMITS: BundleLimits = Object.freeze({
  bundleBytes: 50 * 1024 * 1024,
  manifestBytes: 16 * 1024 * 1024,
  items: 10_000,
  pages: 2_000,
  resources: 2_000,
  resourceBytes: 50 * 1024 * 1024,
  imagePixels: 40_000_000,
});

/** The bytes of a bundle's manifest: its pages and rows (`{ pages, items }`) as UTF-8 JSON. */
export function manifestBytesOf(rows: object): number {
  return new TextEncoder().encode(JSON.stringify(rows)).length;
}

/** Refuse `value` when it is past the limit named `limit`. */
export function assertWithinLimit(
  kind: BundleKind,
  limits: BundleLimits,
  limit: keyof BundleLimits,
  value: number,
): void {
  const max = limits[limit];
  if (value <= max) return;
  throw new EngineError(
    EngineErrorCode.PayloadTooLarge,
    `the ${kind} bundle is past its ${limit} limit: ${value} > ${max}`,
    { details: { limit, max, value } },
  );
}
