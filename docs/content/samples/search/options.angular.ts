import {
  ChangeDetectionStrategy,
  Component,
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
import type { SearchQuery } from '@embedpdf/angular/search';
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

@Component({
  selector: 'demo-search-with-options',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toolbar">
      <input
        #field
        class="field"
        type="search"
        aria-label="Search"
        placeholder="Search…"
        [value]="query().text"
        (input)="change({ text: field.value })"
      />
      <label class="option">
        <input
          #matchCase
          type="checkbox"
          [checked]="query().matchCase"
          (change)="change({ matchCase: matchCase.checked })"
        />
        Match case
      </label>
      <label class="option">
        <input
          #wholeWord
          type="checkbox"
          [checked]="query().wholeWord"
          (change)="change({ wholeWord: wholeWord.checked })"
        />
        Whole words
      </label>
      <output class="readout">{{ search.hitCount() }} matches</output>
    </div>
  `,
})
export class SearchWithOptions {
  protected readonly search = inject(EpdfSearch);
  protected readonly query = signal<SearchQuery>({
    text: 'pdf',
    matchCase: false,
    wholeWord: false,
  });

  constructor() {
    // The text and the options are one query: changing either searches again.
    effect(() => {
      const query = this.query();
      void this.search.search(query);
    });
  }

  protected change(part: Partial<SearchQuery>) {
    this.query.update((query) => ({ ...query, ...part }));
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
    SearchWithOptions,
  ],
  providers: [
    provideEmbedPdf(
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './options.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-search-with-options />
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
