/**
 * @embedpdf/plugin-annotation/internal — the framework/host entry.
 *
 * This is NOT for application code. It preserves the implementation helpers
 * used by framework code and re-exports the full annotation host capability.
 * Sibling plugins use `@embedpdf/plugin-annotation/contract/host` instead;
 * `/internal` is an API-visibility boundary, not a bundle-purity boundary.
 * App code imports the public surface from `@embedpdf/plugin-annotation`.
 *
 * The token re-exported here is the SAME runtime object as the public one — only
 * its TypeScript type differs (the host lens), so resolving it returns the one
 * cached capability instance with every method visible.
 */
export * from './host-contract';
export { createAnnotationCapability } from './capability';
export { buildToolRegistry } from './tools';
export type { ResolvedTool } from './tools';
