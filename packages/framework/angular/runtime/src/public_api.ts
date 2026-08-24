/**
 * @embedpdf/angular/runtime — the trunk: the generic kernel binding.
 *
 * Binds the kernel's one change stream to Angular signals (one tick signal +
 * computed), resolves capabilities (document-scoped ones against the active or
 * `[epdfDocumentScope]`-given document), and provides the page context seam.
 * Every feature entry point and layer rides on this — there is no per-plugin
 * framework code.
 */

// One-line-per-feature: registration travels with the UI.
export * from '@embedpdf/core';
export * from './kernel-host';
export * from './tokens';
export * from './inject';
export * from './scope';
export * from './viewer';
export * from './page-context';
