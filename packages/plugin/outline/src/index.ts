/**
 * @embedpdf/plugin-outline: the document's outline (its bookmarks), mirrored
 * from the engine, with which items are expanded and selected, the item for
 * the reading position, and its edits as undoable changes.
 * Layout: contract.ts · model.ts · controller.ts · state.ts · outline.plugin.ts.
 */
export { outlinePlugin } from './outline.plugin';
export { outlineState, type OutlineState } from './state';
export * from './contract';
