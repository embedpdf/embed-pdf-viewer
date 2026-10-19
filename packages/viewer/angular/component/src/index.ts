/**
 * @embedpdf/viewer-angular/component — what both doors share, engine-blind: the component's
 * base, the templates you give it and what they read, and the viewer's own button and menu.
 * Apps import a door (`@embedpdf/viewer-angular`, or `/core`), which re-exports these with the
 * viewer's vocabulary; a door of another package (the CloudPDF one) builds on the base.
 */
export { definedOf, EpdfPdfViewerBase, EpdfViewerSlots } from './component';
export type { ViewerInside } from './component';
export { EpdfPdfViewerRef } from './viewer-ref';
export { EpdfPanel, EpdfRegion, EpdfToolbarItem, EpdfToolbarItemContext } from './slots';
export type { RegionName } from './slots';
export { EpdfButton, EpdfMenu, EpdfMenuItem } from './viewer-components';
/**
 * A command as a button needs it, for the active document: the headless `epdfCommand`
 * directive on a button of yours, and `inject(EpdfCommands).commandOf(id)` for anything else.
 * Inside the viewer they read its commands.
 */
export { EpdfCommand, EpdfCommands } from '@embedpdf/angular/commands';
