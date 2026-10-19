/**
 * @embedpdf/angular/commands: every action of the viewer, run from buttons, menus and keys.
 *
 *   withCommands({ commands }), withCommandShortcuts()   for provideEmbedPdf()
 *   standardCommands                                     the commands every viewer has
 *   inject(EpdfCommands)                                 run, find and register commands
 *   [epdfCommand], [epdfCommandShortcuts]                a command button; the keys in one element
 */

// The plugin's types and helpers, so app code has one import for the feature.
export * from '@embedpdf/plugin-commands';
export * from './commands';
