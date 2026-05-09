import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  inject,
  input,
  output,
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
  template: '',
  styles: `
    :host {
      display: block;
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PDFViewer {
  /** Full configuration for the PDF viewer */
  readonly config = input<PDFViewerConfig>({});

  /** Emitted when the viewer container is initialized */
  readonly init = output<EmbedPdfContainer>();

  /** Emitted when the plugin registry is ready */
  readonly ready = output<PluginRegistry>();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private targetElement: HTMLElement | null = null;

  /** The active EmbedPdfContainer, or null when destroyed/uninitialized */
  container: EmbedPdfContainer | null = null;

  constructor() {
    afterRenderEffect({
      write: () => {
        const config = this.config();

        if (!this.container || this.destroyRef.destroyed) return;

        this.container.config = config;
      },
    });

    afterNextRender({
      write: () => {
        if (this.destroyRef.destroyed) return;

        const target = this.hostRef.nativeElement;
        this.targetElement = target;

        const viewer = EmbedPDF.init({
          type: 'container',
          target,
          ...this.config(),
        });

        if (!viewer || this.destroyRef.destroyed) return;

        this.container = viewer;
        this.init.emit(viewer);

        void viewer.registry.then((registry) => {
          if (!this.destroyRef.destroyed) {
            this.ready.emit(registry);
          }
        });
      },
    });

    this.destroyRef.onDestroy(() => {
      this.targetElement?.replaceChildren();
      this.targetElement = null;
      this.container = null;
    });
  }

  /** Promise that resolves to the PluginRegistry */
  get registry(): Promise<PluginRegistry> | null {
    return this.container?.registry ?? null;
  }
}
