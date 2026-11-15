import { EngineError, EngineErrorCode, type BundleLimits } from '@embedpdf/engine-core/runtime';

/**
 * Refuses a copy inside a document when `value` is past the limit named
 * `limit`, as a bundle past it is refused: a copy carries what a bundle may.
 */
export function assertCopyWithinLimit(
  limits: BundleLimits,
  limit: keyof BundleLimits,
  value: number,
): void {
  const max = limits[limit];
  if (value <= max) return;
  throw new EngineError(
    EngineErrorCode.PayloadTooLarge,
    `copy: past the ${limit} limit: ${value} > ${max}`,
    { details: { limit, max, value } },
  );
}
