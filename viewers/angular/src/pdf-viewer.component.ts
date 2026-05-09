import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  afterNextRender,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import EmbedPDF, {
  type EmbedPdfContainer,
  type PDFViewerConfig,
  type PluginRegistry,
  type Theme,
  type ThemePreference,
} from '@embedpdf/snippet';

import { EMBEDPDF_VIEWER_DEFAULT_CONFIG, mergeViewerConfigs } from './pdf-viewer.config';

export type EmbedpdfThemeChangeEvent = {
  preference: ThemePreference;
  colorScheme: 'light' | 'dark';
  theme: Theme;
};

/**
 * Angular component for embedding PDF documents.
 *
 * @example
 * ```html
 * <embedpdf-viewer
 *   [config]="{ src: '/document.pdf', theme: { preference: 'system' } }"
 *   (ready)="onReady($event)"
 *   style="display:block;width:100%;height:100vh"
 * />
 * ```
 */
@Component({
  selector: 'embedpdf-viewer',
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

  /** Emitted when the active theme changes (forwards the snippet's `themechange` custom event) */
  readonly themechange = output<EmbedpdfThemeChangeEvent>();

  /** The active EmbedPdfContainer, or null when destroyed/uninitialized */
  readonly container = signal<EmbedPdfContainer | null>(null);

  /** The active PluginRegistry, or null until the viewer's registry promise resolves */
  readonly registry = signal<PluginRegistry | null>(null);

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly defaultConfig =
    inject(EMBEDPDF_VIEWER_DEFAULT_CONFIG, { optional: true }) ?? null;
  private readonly resolvedConfig = computed(() =>
    mergeViewerConfigs(this.defaultConfig, this.config()),
  );
  private targetElement: HTMLElement | null = null;
  private themechangeHandler: ((event: Event) => void) | null = null;

  constructor() {
    afterRenderEffect({
      write: () => {
        const config = this.resolvedConfig();
        const viewer = untracked(() => this.container());

        if (!viewer || this.destroyRef.destroyed) return;

        viewer.config = config;
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
          ...this.resolvedConfig(),
        });

        if (!viewer || this.destroyRef.destroyed) return;

        const themechangeHandler = (event: Event) => {
          if (this.destroyRef.destroyed) return;
          const detail = (event as CustomEvent<EmbedpdfThemeChangeEvent>).detail;
          if (detail) this.themechange.emit(detail);
        };
        viewer.addEventListener('themechange', themechangeHandler);
        this.themechangeHandler = themechangeHandler;

        this.container.set(viewer);
        this.init.emit(viewer);

        void viewer.registry.then((registry) => {
          if (this.destroyRef.destroyed) return;
          this.registry.set(registry);
          this.ready.emit(registry);
        });
      },
    });

    this.destroyRef.onDestroy(() => {
      const viewer = this.container();
      if (viewer && this.themechangeHandler) {
        viewer.removeEventListener('themechange', this.themechangeHandler);
      }
      this.themechangeHandler = null;
      this.targetElement?.replaceChildren();
      this.targetElement = null;
      this.container.set(null);
      this.registry.set(null);
    });
  }
}
