import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  signal,
  ViewEncapsulation,
} from '@angular/core';
import { EpdfDocumentGate, provideEmbedPdf } from '@embedpdf/angular/runtime';
import type { OpenInput } from '@embedpdf/angular/runtime';
import { EpdfPageTemplate, EpdfStage, withStage } from '@embedpdf/angular/stage';
import { EpdfRenderLayer, withRender } from '@embedpdf/angular/render';
import { EpdfSearch, EpdfSearchLayer, withSearch } from '@embedpdf/angular/search';
import { cloudEngine } from '@cloudpdf/engine';

const ebook: OpenInput = { kind: 'share', shareToken: 'shr_WGj1goAtlNN_fQ5OswPrbJQM' };

@Component({
  selector: 'demo-search-box',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <input
        #field
        class="field"
        type="search"
        aria-label="Search"
        placeholder="Search…"
        [value]="text()"
        (input)="text.set(field.value)"
        (keydown.enter)="search.nextHit()"
        (keydown.shift.enter)="search.previousHit()"
      />
      <output class="readout">{{ count() }}</output>
      <button
        type="button"
        class="button"
        aria-label="Previous match"
        [disabled]="search.hitCount() === 0"
        (click)="search.previousHit()"
      >
        ↑
      </button>
      <button
        type="button"
        class="button"
        aria-label="Next match"
        [disabled]="search.hitCount() === 0"
        (click)="search.nextHit()"
      >
        ↓
      </button>
    </div>
  `,
})
export class SearchBox {
  protected readonly search = inject(EpdfSearch);
  protected readonly text = signal('PDF');

  protected readonly count = computed(() => {
    if (this.search.hitCount() > 0) {
      return `${this.search.activeHitIndex() + 1} of ${this.search.hitCount()}`;
    }
    if (this.search.status() === 'searching') return 'Searching…';
    if (this.search.status() === 'complete') return 'No matches';
    return '';
  });

  constructor() {
    // Every change searches again, replacing the last search. An empty text clears it.
    effect(() => {
      const text = this.text();
      void this.search.search({ text });
    });
  }
}

@Component({
  selector: 'demo-root',
  imports: [
    EpdfDocumentGate,
    EpdfStage,
    EpdfPageTemplate,
    EpdfRenderLayer,
    EpdfSearchLayer,
    SearchBox,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => cloudEngine({ baseUrl: 'https://engine.cloudpdf.com' }), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './basic.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-search-box />
      <epdf-stage class="stage">
        <ng-template epdfPage>
          <epdf-render-layer />
          <epdf-search-layer />
        </ng-template>
      </epdf-stage>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {}
