/**
 * @embedpdf/web/controller: the viewer as one object, for an app that brings its own buttons.
 *
 * `createViewerController(kernel)` reads a kernel someone else owns (a framework adapter's
 * `<Viewer>`); `createViewer({ engine, src })` makes and owns one. Both give one snapshot of what
 * a toolbar shows (`getState()` + `subscribe()`), the common commands by name, and a few events.
 * Every value and command is the installed plugins' own; nothing here keeps a second copy.
 */
export { createViewerController } from './controller/controller';
export type {
  ViewerController,
  ViewerControllerOptions,
  ViewerEvents,
  ViewerSearchState,
  ViewerState,
  ViewerStatus,
  ViewerZoom,
} from './controller/controller';
export { createViewer, viewerPlugins } from './controller/create-viewer';
export type { CreateViewerOptions, OwnedViewerController } from './controller/create-viewer';
