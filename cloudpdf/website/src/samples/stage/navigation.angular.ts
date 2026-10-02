import { ChangeDetectionStrategy, Component, signal, ViewEncapsulation } from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-root',
  imports: [EpdfDocumentGate, EpdfStage, EpdfPageTemplate, EpdfRenderLayer],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './navigation.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <div class="toolbar">
        <button
          type="button"
          class="button"
          [disabled]="!stage.canGoPrevious()"
          (click)="stage.previousPage()"
        >
          ‹ Previous
        </button>
        <output class="badge">
          Page
          <strong>{{ stage.currentPageIndex() + 1 }} / {{ stage.pageCount() }}</strong>
        </output>
        <button
          type="button"
          class="button"
          [disabled]="!stage.canGoNext()"
          (click)="stage.nextPage()"
        >
          Next ›
        </button>
        <input
          #field
          class="field"
          inputmode="numeric"
          aria-label="Go to page"
          placeholder="Go to page…"
          [value]="typed()"
          (input)="typed.set(field.value)"
          (keydown.enter)="jump(stage)"
        />
      </div>

      <epdf-stage #stage="epdfStage" class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly typed = signal('');

  // People count from 1, an index from 0. An index past the end goes to the last page.
  protected jump(stage: EpdfStage) {
    const number = Number(this.typed());
    if (Number.isInteger(number) && number >= 1) stage.goToPage(number - 1);
    this.typed.set('');
  }
}
