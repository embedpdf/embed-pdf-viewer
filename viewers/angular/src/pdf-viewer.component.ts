import {
  AfterViewInit,
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  input,
  output,
  viewChild,
} from '@angular/core';
import EmbedPDF, {
  type EmbedPdfContainer,
  type PDFViewerConfig,
  type PluginRegistry,
} from '@embedpdf/snippet';

/**
 * Angular component for embedding PDF documents.
 *
 * @example
 * ```html
 * <embedpdf-pdf-viewer
 *   [config]="{ src: '/document.pdf', theme: { preference: 'system' } }"
 *   (ready)="onReady($event)"
 *   style="display:block;width:100%;height:100vh"
 * />
 * ```
 */
@Component({
  selector: 'embedpdf-pdf-viewer',
  template: `<div #container style="width:100%;height:100%"></div>`,
  styles: `:host { display: block; }`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PDFViewer implements AfterViewInit, OnDestroy {
  /** Full configuration for the PDF viewer */
  readonly config = input<PDFViewerConfig>({});

  /** Emitted when the viewer container is initialized */
  readonly init = output<EmbedPdfContainer>();

  /** Emitted when the plugin registry is ready */
  readonly ready = output<PluginRegistry>();

  private readonly containerRef =
    viewChild.required<ElementRef<HTMLDivElement>>('container');

  /** The active EmbedPdfContainer, or null when destroyed/uninitialized */
  container: EmbedPdfContainer | null = null;

  ngAfterViewInit(): void {
    const target = this.containerRef().nativeElement;

    const viewer = EmbedPDF.init({
      type: 'container',
      target,
      ...this.config(),
    });

    if (!viewer) return;

    this.container = viewer;
    this.init.emit(viewer);

    viewer.registry.then((registry) => {
      this.ready.emit(registry);
    });
  }

  ngOnDestroy(): void {
    const target = this.containerRef()?.nativeElement;
    target?.replaceChildren();
    this.container = null;
  }

  /** Promise that resolves to the PluginRegistry */
  get registry(): Promise<PluginRegistry> | null {
    return this.container?.registry ?? null;
  }
}
