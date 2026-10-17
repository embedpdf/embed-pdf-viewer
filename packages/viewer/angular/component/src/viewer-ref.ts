/**
 * `EpdfPdfViewerRef`: the viewer in code, for your components. Inside `<epdf-pdf-viewer>` (in a
 * template you put in it) `inject(EpdfPdfViewerRef)` gives the viewer it belongs to; around it,
 * `viewChild(EpdfPdfViewerRef)` gives the same, or keep the viewer `(ready)` gives you. Types
 * only from the viewer: this module is shared by both doors.
 */
import { Injectable, type Signal } from '@angular/core';
import type { EmbedPdfViewerElement, Viewer } from '@embedpdf/viewer/core';

const outsideTheViewer = (): never => {
  throw new Error(
    '[embedpdf] inject(EpdfPdfViewerRef) works in a component inside <epdf-pdf-viewer>: in one ' +
      'of its templates (epdfToolbarItem, epdfPanel, epdfRegion). Around the viewer, use ' +
      'viewChild(EpdfPdfViewerRef), or keep the viewer (ready) gives you.',
  );
};

/** The viewer an `<epdf-pdf-viewer>` runs, and its element. */
@Injectable({ providedIn: 'root', useFactory: outsideTheViewer })
export abstract class EpdfPdfViewerRef {
  /**
   * The `viewer`: `get(name)`, `documents`, `commands`, `watch` and `forDocument`. Null until it's
   * ready, and a new one when the element mounts a new viewer. Your templates mount once it's
   * ready, so in them it's always there.
   */
  abstract readonly viewer: Signal<Viewer | null>;
  /** The `<embedpdf-viewer>` element inside, for its imperative surface. */
  abstract readonly element: Signal<EmbedPdfViewerElement>;
}
