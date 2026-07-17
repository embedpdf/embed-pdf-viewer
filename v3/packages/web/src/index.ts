/**
 * @embedpdf-x/web — framework-free browser adapters.
 *
 * The single home for EmbedPDF v3 code that touches `window`/`document`. The
 * plugin and *-core packages compile with `lib: ['ES2020']` (no DOM), so the
 * boundary is enforced by the type system, not convention: DOM simply does not
 * exist in their type universe. Anything environmental — file dialogs, clipboard,
 * print — lives here and is consumed by the framework adapters (react, vue, …).
 */
export { pickImageFile, pickFile, saveFile } from './file-picker';
export type { PickFileOptions } from './file-picker';
export { svgCursor } from './cursor';
export type { SvgCursorOptions } from './cursor';
