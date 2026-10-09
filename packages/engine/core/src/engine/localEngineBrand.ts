/**
 * Marks what the local engine makes (its engine, documents and pages), so
 * `isLocalEngine()` and `isLocalDocument()` can tell them apart from another
 * engine's. `Symbol.for`, so two copies of this package agree.
 */
export const LOCAL_ENGINE_BRAND: unique symbol = Symbol.for('@embedpdf/engine/local');

/** Whether `value` carries the local engine's mark. */
export function hasLocalEngineBrand(value: unknown): boolean {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [LOCAL_ENGINE_BRAND]?: unknown })[LOCAL_ENGINE_BRAND] === true
  );
}
