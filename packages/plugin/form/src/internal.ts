/**
 * @embedpdf/plugin-form/internal — the plugin-to-plugin entry.
 *
 * This is NOT for application code. It exposes the host lens
 * ({@link FormHostCapability}): the two action-executor doors the actions
 * plugin's `javascript` / `reset-form` executors call into. App code imports
 * the public surface from `@embedpdf/plugin-form`.
 *
 * The token re-exported here is the SAME runtime object as the public one —
 * only its TypeScript type differs (the host lens), so resolving it returns
 * the one cached capability instance with every method visible.
 */
export { FormToken } from './types';
export type { FormHostCapability } from './types';
