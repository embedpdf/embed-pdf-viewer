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
} from '@angular/core'
import EmbedPDF, {
  type EmbedPdfContainer,
  type PDFViewerConfig,
  type PluginRegistry,
  type Theme,
  type ThemePreference,
} from '@embedpdf/snippet'

import { EMBEDPDF_VIEWER_DEFAULT_CONFIG, mergeViewerConfigs } from './pdf-viewer.config'

export type EmbedPdfThemeChangeEvent = {
  preference: ThemePreference
  colorScheme: 'light' | 'dark'
  theme: Theme
}

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
  readonly config = input<PDFViewerConfig>({})
  readonly init = output<EmbedPdfContainer>()
  readonly ready = output<PluginRegistry>()
  readonly themechange = output<EmbedPdfThemeChangeEvent>()
  readonly container = signal<EmbedPdfContainer | null>(null)
  readonly registry = signal<PluginRegistry | null>(null)

  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef)
  private readonly destroyRef = inject(DestroyRef)
  private readonly defaultConfig = inject(EMBEDPDF_VIEWER_DEFAULT_CONFIG, {
    optional: true,
  })
  private readonly resolvedConfig = computed(() =>
    mergeViewerConfigs(this.defaultConfig, this.config()),
  )
  private targetElement: HTMLElement | null = null
  private themechangeHandler: ((event: Event) => void) | null = null

  constructor() {
    afterRenderEffect({
      write: () => {
        const config = this.resolvedConfig()
        const viewer = untracked(() => this.container())

        if (!viewer || this.destroyRef.destroyed) return

        viewer.config = config
      },
    })

    afterNextRender({
      write: () => {
        if (this.destroyRef.destroyed) return

        const target = this.hostRef.nativeElement
        this.targetElement = target

        const viewer = EmbedPDF.init({
          type: 'container',
          target,
          ...this.resolvedConfig(),
        })

        if (!viewer || this.destroyRef.destroyed) return

        const themechangeHandler = (event: Event) => {
          if (this.destroyRef.destroyed) return
          const detail = (event as CustomEvent<EmbedPdfThemeChangeEvent>).detail
          if (detail) this.themechange.emit(detail)
        }

        viewer.addEventListener('themechange', themechangeHandler)
        this.themechangeHandler = themechangeHandler

        this.container.set(viewer)
        this.init.emit(viewer)

        void viewer.registry.then((registry) => {
          if (this.destroyRef.destroyed) return
          this.registry.set(registry)
          this.ready.emit(registry)
        })
      },
    })

    this.destroyRef.onDestroy(() => {
      const viewer = this.container()
      if (viewer && this.themechangeHandler) {
        viewer.removeEventListener('themechange', this.themechangeHandler)
      }

      this.themechangeHandler = null
      this.targetElement?.replaceChildren()
      this.targetElement = null
      this.container.set(null)
      this.registry.set(null)
    })
  }
}
