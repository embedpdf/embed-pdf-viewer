import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  model,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfInteraction, withInteraction } from '@embedpdf/angular/interaction';
import { EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

const TOOLS = [
  { id: 'note', label: 'Note' },
  { id: 'square', label: 'Rectangle' },
];

@Component({
  selector: 'demo-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <div class="segmented" role="group" aria-label="Tool">
        @for (tool of tools; track tool.id) {
          <button
            type="button"
            [attr.aria-pressed]="interaction.activeToolId() === tool.id"
            (click)="interaction.activateTool(tool.id)"
          >
            {{ tool.label }}
          </button>
        }
      </div>
      <label class="range">
        From CSS
        <input
          #slider
          type="range"
          min="0.1"
          max="0.9"
          step="0.1"
          [value]="opacity() ?? 0.5"
          (input)="opacity.set(+slider.value)"
        />
        <output class="readout">{{ readout() }}</output>
      </label>
      <button
        type="button"
        class="button"
        [disabled]="opacity() === null"
        (click)="opacity.set(null)"
      >
        Reset
      </button>
    </div>
  `,
})
export class Toolbar {
  /** The ghost opacity from CSS, or `null` for each tool's own. */
  readonly opacity = model.required<number | null>();

  protected readonly interaction = inject(EpdfInteraction);
  protected readonly tools = TOOLS;
  protected readonly readout = computed(() => {
    const opacity = this.opacity();
    return opacity === null ? "each tool's own" : `${Math.round(opacity * 100)}%`;
  });

  constructor() {
    // The note tool is active on load: move the pointer over the page.
    this.interaction.activateTool('note');
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfAnnotationLayer,
    Toolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      // A preview for the rectangle (off by default for tools you drag), and a fainter one for notes.
      withAnnotation({
        tools: [
          { id: 'square', ghost: true },
          { id: 'note', ghost: { opacity: 0.3 } },
        ],
      }),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './ghost.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-toolbar [(opacity)]="opacity" />
      <epdf-stage class="stage" [style.--epdf-ghost-opacity]="opacity()">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  // `--epdf-ghost-opacity` from CSS wins over each tool's own opacity, for every tool.
  protected readonly opacity = signal<number | null>(null);
}
