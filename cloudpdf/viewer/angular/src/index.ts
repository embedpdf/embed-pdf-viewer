/**
 * @cloudpdf/viewer-angular — the full viewer as an Angular component, with the CloudPDF engine as
 * the default: the same `<epdf-pdf-viewer>` as `@embedpdf/viewer-angular`, whose documents live on
 * your CloudPDF.
 *
 * ```ts
 * import { EpdfPdfViewer } from '@cloudpdf/viewer-angular';
 *
 * @Component({
 *   imports: [EpdfPdfViewer],
 *   template: `<epdf-pdf-viewer [src]="{ token: token() }" style="height: 100vh" />`,
 * })
 * ```
 *
 * A door like the open viewer's two (docs/conventions/viewer-doors.md): it imports the cloud
 * door, which registers the cloud engine on `<embedpdf-viewer>`, re-exports the wrapper's parts,
 * and types the component's inputs with the cloud's `ViewerConfig`. `engine` takes the cloud
 * engine's settings (`baseUrl`, CloudPDF SaaS when left out), `src` a document token, an id or a
 * grant. There is no `scope` or `identity`: the document's token carries them.
 */
import '@cloudpdf/viewer';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  type InputSignal,
  type Signal,
} from '@angular/core';
import type { ElementConfig, ViewerConfig } from '@cloudpdf/viewer';
import {
  definedOf,
  EpdfPdfViewerBase,
  EpdfPdfViewerRef,
  EpdfViewerSlots,
} from '@embedpdf/viewer-angular/component';

export * from '@cloudpdf/viewer';
export {
  EpdfButton,
  EpdfCommand,
  EpdfCommands,
  EpdfMenu,
  EpdfMenuItem,
  EpdfPanel,
  EpdfPdfViewerRef,
  EpdfRegion,
  EpdfToolbarItem,
  EpdfToolbarItemContext,
} from '@embedpdf/viewer-angular/component';
export type { RegionName } from '@embedpdf/viewer-angular/component';

@Component({
  selector: 'epdf-pdf-viewer',
  imports: [EpdfViewerSlots],
  providers: [{ provide: EpdfPdfViewerRef, useExisting: forwardRef(() => EpdfPdfViewer) }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: '<embedpdf-viewer [owner]="this" />',
})
export class EpdfPdfViewer extends EpdfPdfViewerBase {
  /** The whole config at once; each input given wins over its key here. */
  readonly config = input<ViewerConfig>();
  /** The cloud engine's settings (`baseUrl`, the engine's own `token`, `fetch`), or an engine of
   *  your own. Read once. */
  readonly engine: InputSignal<ViewerConfig['engine'] | undefined> =
    input<ViewerConfig['engine']>();
  /**
   * One document: `{ token }` (a document token), `{ id }` (the engine's `token` must allow it)
   * or `{ grant }` (a grant from the dashboard). Another one opens in its place;
   * `null` closes it.
   */
  readonly src: InputSignal<ViewerConfig['src'] | undefined> = input<ViewerConfig['src']>();
  /** Several documents, with their names and passwords; with these, `src` is ignored. Read once. */
  readonly documents: InputSignal<ViewerConfig['documents'] | undefined> =
    input<ViewerConfig['documents']>();

  protected readonly elementConfig: Signal<ElementConfig> = computed(() => ({
    ...this.config(),
    ...definedOf({
      engine: this.engine(),
      src: this.src(),
      documents: this.documents(),
    }),
    ...this.sharedConfig(),
  }));
}
