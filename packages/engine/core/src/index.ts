/**
 * @embedpdf/engine-core - zod-free shared domain surface.
 *
 * Runtime implementations import engine handles, promises, and worker protocol
 * from `@embedpdf/engine-core/runtime`.
 * Import schema-backed HTTP contracts from `@embedpdf/engine-core/wire`, and
 * the engine's own write checks and import planners, built with zod, from
 * `@embedpdf/engine-core/validation`.
 * Import test conformance helpers from `@embedpdf/engine-core/conformance`.
 */

export * from './shared';
