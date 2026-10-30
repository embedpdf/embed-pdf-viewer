/**
 * @embedpdf/viewer-angular — the full viewer as an Angular component, with the built-in local
 * engine (PDFium wasm in a worker) as the default.
 *
 * ```ts
 * @Component({
 *   imports: [EpdfPdfViewer],
 *   template: `<epdf-pdf-viewer src="/report.pdf" style="height: 100vh" />`,
 * })
 * ```
 *
 * Zero config: no `engine` input, no bundler setup. This is the door app code should use. Builds
 * that always give their own engine import `@embedpdf/viewer-angular/core` instead, which is
 * the same component with PDFium structurally absent. The one import below is what makes this
 * entry the local-engine door; everything else is shared (`@embedpdf/viewer-angular/component`).
 */
import '@embedpdf/viewer';

import {
  ChangeDetectionStrategy,
  Component,
  computed,
  forwardRef,
  input,
  type InputSignal,
  type Signal,
} from '@angular/core';
import type { ElementConfig, ViewerConfig } from '@embedpdf/viewer';
import {
  definedOf,
  EpdfPdfViewerBase,
  EpdfPdfViewerRef,
  EpdfViewerSlots,
} from '@embedpdf/viewer-angular/component';

// The whole customization vocabulary (plus the local engine's config types) rides along, so apps
// import one package.
export * from '@embedpdf/viewer';
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

/**
 * `<epdf-pdf-viewer>`: the full viewer. Each key of the config is an input, or give them all at
 * once with `[config]`; an input given wins over `[config]`'s value. `engine` is optional: leave
 * it out for the built-in local engine, or give its options (`{ wasmUrl }`, `{ assetsUrl }`,
 * worker URLs for a strict CSP). Your own components go in as `<ng-template epdfToolbarItem>`,
 * `epdfPanel` and `epdfRegion`; `(ready)`, `(documentChange)` and `(panelResize)` say what the
 * viewer does.
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
  /** The whole config at once; each input given wins over its key here. */
  readonly config = input<ViewerConfig>();
  /** The built-in engine's options, or an engine of your own. Read once. */
  readonly engine: InputSignal<ViewerConfig['engine'] | undefined> =
    input<ViewerConfig['engine']>();
  /** One document: a URL, a `File`, or bytes. Another one opens in its place; `null` closes it. */
  readonly src: InputSignal<ViewerConfig['src'] | undefined> = input<ViewerConfig['src']>();
  /** Several documents, with their names and passwords; with these, `src` is ignored. Read once. */
  readonly documents: InputSignal<ViewerConfig['documents'] | undefined> =
    input<ViewerConfig['documents']>();
  /**
   * How a document at a URL downloads: your own `fetch`, to add headers or cookies. Follows its
   * input: the next download uses the new one.
   */
  readonly fetch: InputSignal<ViewerConfig['fetch'] | undefined> = input<ViewerConfig['fetch']>();
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
      fetch: this.fetch(),
      scope: this.scope(),
      identity: this.identity(),
    }),
    ...this.sharedConfig(),
  }));
}
