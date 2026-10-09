/**
 * @embedpdf/svelte/page-edit — rotate, move, insert, delete and extract pages.
 *
 * The plugin turns a page relative to its rotation and resolves placements, so this is binding
 * only. The pages themselves come from `usePageList()` (`@embedpdf/svelte/runtime`), which
 * follows every edit:
 *
 *   const pageEdit = usePageEdit();
 *   await pageEdit.rotateBy([page.ref], 90);
 */

// Registration travels with the UI.
export * from '@embedpdf/plugin-page-edit';

export { usePageEdit } from './page-edit/readers';
