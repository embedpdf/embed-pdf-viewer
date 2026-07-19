/**
 * @embedpdf/plugin-annotation/internal — the framework/host entry.
 *
 * This is NOT for application code. It exposes the full annotation capability
 * surface ({@link AnnotationHostCapability}: render projection, pointer-gesture
 * intents, behavior registration) plus the bridge helpers the render layer needs.
 * App code imports the public surface from `@embedpdf/plugin-annotation`.
 *
 * The token re-exported here is the SAME runtime object as the public one — only
 * its TypeScript type differs (the host lens), so resolving it returns the one
 * cached capability instance with every method visible.
 */
export { AnnotationToken } from './types';
export type { AnnotationHostCapability } from './types';
export { createAnnotationCapability } from './capability';
export { buildToolRegistry } from './tools';
export type { ResolvedTool } from './tools';
