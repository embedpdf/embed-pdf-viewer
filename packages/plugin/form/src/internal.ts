/**
 * @embedpdf/plugin-form/internal — implementation helpers for framework code.
 *
 * This is NOT for application code. It re-exports the host lens
 * ({@link FormHostCapability}): the two action-executor doors the actions
 * plugin's `javascript` / `reset-form` executors call into. Sibling plugins
 * import it from `@embedpdf/plugin-form/contract/host`; `/internal` is an
 * API-visibility boundary, not a bundle-purity boundary.
 *
 * The token re-exported here is the SAME runtime object as the public one —
 * only its TypeScript type differs (the host lens), so resolving it returns
 * the one cached capability instance with every method visible.
 */
export * from './host-contract';
