import { isPlatformBrowser } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  PLATFORM_ID,
  afterNextRender,
  computed,
  effect,
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

export type EmbedPdfThemeChangeEvent = {
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
  readonly themeChange = output<EmbedPdfThemeChangeEvent>();

  private readonly _container = signal<EmbedPdfContainer | null>(null);
  /** The active EmbedPdfContainer, or null when destroyed/uninitialized */
  readonly container = this._container.asReadonly();

  private readonly _registry = signal<PluginRegistry | null>(null);
  /** The active PluginRegistry, or null until the viewer's registry promise resolves */
  readonly registry = this._registry.asReadonly();

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroyRef = inject(DestroyRef);
  private readonly platformId = inject(PLATFORM_ID);
  private readonly defaultConfig = inject(EMBEDPDF_VIEWER_DEFAULT_CONFIG, { optional: true });
  private readonly resolvedConfig = computed(() =>
    mergeViewerConfigs(this.defaultConfig, this.config()),
  );

  constructor() {
    if (!isPlatformBrowser(this.platformId)) return;

    effect(() => {
      const config = this.resolvedConfig();
      const viewer = untracked(() => this._container());

      if (!viewer || this.destroyRef.destroyed) return;

      // Setting `viewer.config` triggers a full re-render in the snippet container.
      // Skip the write when the resolved config is the exact reference already on
      // the container — defensive guard against rare cases where the effect runs
      // again with an unchanged resolvedConfig (e.g. across HMR boundaries).
      if (viewer.config === config) return;

      viewer.config = config;
    });

    afterNextRender({
      write: () => {
        if (this.destroyRef.destroyed) return;

        const target = this.hostRef.nativeElement;

        const viewer = EmbedPDF.init({
          type: 'container',
          target,
          ...this.resolvedConfig(),
        });

        if (!viewer || this.destroyRef.destroyed) return;

        const listenerController = new AbortController();
        viewer.addEventListener(
          'themechange',
          (event: Event) => {
            const detail = (event as CustomEvent<EmbedPdfThemeChangeEvent>).detail;
            if (detail) this.themeChange.emit(detail);
          },
          { signal: listenerController.signal },
        );

        this.destroyRef.onDestroy(() => listenerController.abort());

        this._container.set(viewer);
        this.init.emit(viewer);

        void viewer.registry.then((registry: PluginRegistry) => {
          if (this.destroyRef.destroyed) return;
          this._registry.set(registry);
          this.ready.emit(registry);
        });
      },
    });

    this.destroyRef.onDestroy(() => {
      this.hostRef.nativeElement.replaceChildren();
      this._container.set(null);
      this._registry.set(null);
    });
  }
}
