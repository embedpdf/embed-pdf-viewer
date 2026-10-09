import {
  ChangeDetectionStrategy,
  Component,
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

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

// Every field of the selection's state, as it changes.
@Component({
  selector: 'demo-selection-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dl class="status">
      <div class="field">
        <dt>hasSelection</dt>
        <dd>{{ selection.hasSelection() }}</dd>
      </div>
      <div class="field" [attr.data-live]="selection.isSelecting()">
        <dt>isSelecting</dt>
        <dd>{{ selection.isSelecting() }}</dd>
      </div>
      <div class="field">
        <dt>pages</dt>
        <dd>
          {{ selection.pages().length === 1 ? '1 page' : selection.pages().length + ' pages' }}
        </dd>
      </div>
      <div class="field">
        <dt>range</dt>
        <dd>
          @if (selection.range(); as range) {
            {{ range.start.index }} → {{ range.end.index }}
          } @else {
            null
          }
        </dd>
      </div>
    </dl>
  `,
})
export class SelectionStatus {
  protected readonly selection = inject(EpdfSelection);
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSelectionLayer,
    SelectionStatus,
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
  styleUrl: './state.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-selection-status />
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
export class App {
  private readonly selection = inject(EpdfSelection);
  private readonly document = inject(EpdfDocument);

  constructor() {
    // Something selected on load: the title on the cover.
    effect(() => {
      const cover = this.document.pages()[0]?.ref;
      if (cover) this.selection.select({ page: cover, start: 10, count: 52 });
    });
  }
}
