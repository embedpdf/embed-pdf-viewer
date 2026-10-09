import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocument, EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { withInteraction } from '@embedpdf/angular/interaction';
import { EpdfSelection, EpdfSelectionLayer, withSelection } from '@embedpdf/angular/selection';
import { cloudEngine } from '@cloudpdf/engine';

// On the cover: the characters of its title, and a point on its word "Viewers", in page coordinates.
const TITLE = { start: 10, count: 52 };
const POINT = { x: 260, y: 242 };

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Every button selects on the cover, the first page: by its ref, or by its index, 0.
@Component({
  selector: 'demo-selection-toolbar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <button
        type="button"
        class="button"
        [disabled]="!selection.canSelect() || !cover()"
        (click)="selectTitle()"
      >
        Title
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!selection.canSelect()"
        (click)="selection.selectWordAt(0, point)"
      >
        Word
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!selection.canSelect()"
        (click)="selection.selectLineAt(0, point)"
      >
        Line
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!selection.canSelect()"
        (click)="selection.selectPage(0)"
      >
        Page
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!selection.canSelect()"
        (click)="selection.selectAll()"
      >
        Everything
      </button>
      <button
        type="button"
        class="button"
        [disabled]="!selection.hasSelection()"
        (click)="selection.clear()"
      >
        Clear
      </button>
      <output class="badge">{{ summary() }}</output>
    </div>
  `,
})
export class SelectionToolbar {
  protected readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);
  protected readonly cover = computed(() => this.document.pages()[0]?.ref);
  protected readonly point = POINT;

  protected readonly summary = computed(() => {
    const pages = this.selection.pages();
    const range = this.selection.range();
    if (pages.length > 1) return `On ${pages.length} pages`;
    if (range) return `${range.end.index - range.start.index} characters`;
    return 'Nothing selected';
  });

  constructor() {
    // The title is selected on load.
    effect(() => {
      if (this.cover()) this.selectTitle();
    });
  }

  protected selectTitle() {
    const cover = this.cover();
    if (cover) this.selection.select({ page: cover, ...TITLE });
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
    SelectionToolbar,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withInteraction(),
      withSelection(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './programmatic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-selection-toolbar />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-selection-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
