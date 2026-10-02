/**
 * @embedpdf/angular/shell: which panels, dialogs and menus are open.
 *
 *   withShell()                            the plugin, for provideEmbedPdf()
 *   inject(EpdfShell), shell.surface(id)   the open panels and menus, as signals and calls
 *   <button epdfPanelToggle="comments">    a button that opens and closes a panel
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-shell';
export * from './shell';
