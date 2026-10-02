import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelection, EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { EpdfAnnotation, EpdfAnnotationLayer, withAnnotation } from '@embedpdf/angular/annotation';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// On the cover: the characters of the title's first line.
const FIRST_LINE = { start: 10, count: 17 };

const MARKUP = [
  { tool: 'highlight', label: 'Highlight' },
  { tool: 'underline', label: 'Underline' },
  { tool: 'strikeout', label: 'Strike out' },
  { tool: 'squiggly', label: 'Squiggly' },
];

// The selected text becomes a mark, one per page; the selection is cleared afterwards.
@Component({
  selector: 'demo-markup-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      @for (markup of markups; track markup.tool) {
        <button
          type="button"
          class="button"
          [disabled]="!selection.hasSelection()"
          (click)="mark(markup.tool, markup.label)"
        >
          {{ markup.label }}
        </button>
      }
      <span class="spacer"></span>
      <output class="readout">{{ readout() }}</output>
    </div>
  `,
})
export class MarkupToolbar {
  private readonly annotation = inject(EpdfAnnotation);
  protected readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);
  protected readonly markups = MARKUP;
  private readonly status = signal('');
  protected readonly readout = computed(() =>
    this.selection.hasSelection() ? 'Text selected' : this.status() || 'Select text',
  );

  constructor() {
    // On load: the title's first line is selected, ready to mark.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) this.selection.select({ page: cover, ...FIRST_LINE });
    });
  }

  protected async mark(tool: string, label: string) {
    const { annotations } = await this.annotation.createFromSelection(tool);
    this.status.set(`${label}: ${annotations.length} made`);
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    EpdfAnnotationLayer,
    MarkupToolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
      withAnnotation(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './from-selection.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-markup-toolbar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer [annotations]="false" />
          <epdf-selection-layer />
          <epdf-annotation-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
