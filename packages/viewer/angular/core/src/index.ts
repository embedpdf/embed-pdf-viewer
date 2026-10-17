/**
 * @embedpdf/viewer-angular/core — the engine-agnostic Angular door.
 *
 * ```ts
 * import { EpdfPdfViewer } from '@embedpdf/viewer-angular/core';
 * import { cloudEngine } from '@cloudpdf/engine';
 *
 * readonly engine = () => cloudEngine({ baseUrl, token });
 * // <epdf-pdf-viewer [engine]="engine" [documents]="documents" />
 * ```
 *
 * The same `<epdf-pdf-viewer>` as the main entry, but with no default engine, so `engine` is
 * required and takes only a real implementation (an `Engine`, or a factory the viewer owns the
 * lifetime of). In exchange the local PDFium engine (wasm, worker source, main-thread recipe)
 * never enters your module graph: nothing is stubbed or aliased away, it is simply not imported.
 * App code that wants the batteries-included viewer imports `@embedpdf/viewer-angular`; this
 * entry is for builds that always give their own engine, and what the CloudPDF wrapper builds on
 * (`EpdfPdfViewerBase` and `EpdfViewerSlots`).
 */
import '@embedpdf/viewer/core';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  type InputSignal,
  type Signal,
} from '@angular/core';
import type { ElementConfig, ViewerConfig } from '@embedpdf/viewer/core';
import {
  definedOf,
  EpdfPdfViewerBase,
  EpdfPdfViewerRef,
  EpdfViewerSlots,
} from '@embedpdf/viewer-angular/component';

export * from '@embedpdf/viewer/core';
export {
  definedOf,
  EpdfButton,
  EpdfCommand,
  EpdfCommands,
  EpdfMenu,
  EpdfMenuItem,
  EpdfPanel,
  EpdfPdfViewerBase,
  EpdfPdfViewerRef,
  EpdfRegion,
  EpdfToolbarItem,
  EpdfToolbarItemContext,
  EpdfViewerSlots,
} from '@embedpdf/viewer-angular/component';
export type { RegionName, ViewerInside } from '@embedpdf/viewer-angular/component';

/**
 * `<epdf-pdf-viewer>` with the engine you give it. Each other key of the config is an input, or
 * give them with `[config]`; an input given wins over `[config]`'s value.
 */
@Component({
  selector: 'epdf-pdf-viewer',
  imports: [EpdfViewerSlots],
  providers: [{ provide: EpdfPdfViewerRef, useExisting: forwardRef(() => EpdfPdfViewer) }],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { style: 'display: block' },
  template: '<embedpdf-viewer [owner]="this" />',
})
export class EpdfPdfViewer extends EpdfPdfViewerBase {
  /** The config's other keys at once; each input given wins over its key here. */
  readonly config = input<Partial<ViewerConfig>>();
  /** The engine: an `Engine`, or a function that makes one, which the viewer then owns. Read once. */
  readonly engine: InputSignal<ViewerConfig['engine']> = input.required<ViewerConfig['engine']>();
  /** One document: what the engine opens. Another one opens in its place; `null` closes it. */
  readonly src: InputSignal<ViewerConfig['src'] | undefined> = input<ViewerConfig['src']>();
  /** Several documents, with their names and passwords; with these, `src` is ignored. Read once. */
  readonly documents: InputSignal<ViewerConfig['documents'] | undefined> =
    input<ViewerConfig['documents']>();
  /** What the user may do, as permissions, in every document. Read once. */
  readonly scope: InputSignal<ViewerConfig['scope'] | undefined> = input<ViewerConfig['scope']>();
  /** Who the user is, for comments and signatures. Read once. */
  readonly identity: InputSignal<ViewerConfig['identity'] | undefined> =
    input<ViewerConfig['identity']>();

  protected readonly elementConfig: Signal<ElementConfig> = computed(() => ({
    ...this.config(),
    ...definedOf({
      engine: this.engine(),
      src: this.src(),
      documents: this.documents(),
      scope: this.scope(),
      identity: this.identity(),
    }),
    ...this.sharedConfig(),
  }));
}
