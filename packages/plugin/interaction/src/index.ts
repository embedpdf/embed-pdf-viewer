/**
 * @embedpdf/plugin-interaction — the pointer/tool/cursor hub.
 *
 * One active tool, one cursor, one priority-ordered handler list. Layout:
 * contract.ts · host-contract.ts · model.ts · controller.ts · state.ts ·
 * interaction.plugin.ts. Zero framework code.
 */
export { interactionPlugin } from './interaction.plugin';
export { interactionState } from './state';
export * from './contract';
export { feedbackPlugin } from './feedback';
