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
import { localEngine } from '@embedpdf/engine';

// [!doc-source ebook]
const ebook = async (): Promise<OpenInput> => {
  const response = await fetch('https://snippet.embedpdf.com/ebook.pdf');
  return { kind: 'bytes', id: 'ebook', bytes: new Uint8Array(await response.arrayBuffer()) };
};
// [!/doc-source]

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
      />
      <output class="readout">{{ search.hitCount() }} matches</output>
    </div>
  `,
})
export class SearchBox {
  protected readonly search = inject(EpdfSearch);
  protected readonly text = signal('PDF');

  constructor() {
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
      { engine: () => localEngine(), initialDocuments: [{ source: ebook }] },
      withStage(),
      withRender(),
      withSearch(),
    ),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './results-list.css',
  encapsulation: ViewEncapsulation.None,
  template: `
    <ng-container *epdfDocumentGate="let document; fallback: loading">
      <demo-search-box />
      <div class="viewer">
        <epdf-stage class="stage">
          <ng-template epdfPage>
            <epdf-render-layer />
            <epdf-search-layer />
          </ng-template>
        </epdf-stage>
        <!-- Every match with the words around it. Clicking one makes it the active match and
             scrolls to it. -->
        <ol class="results">
          @for (hit of search.hits(); track hit.page.objectNumber + ':' + hit.start) {
            <li>
              <button
                type="button"
                class="result"
                [attr.aria-current]="$index === search.activeHitIndex()"
                (click)="search.goToHit(hit)"
              >
                <span class="result-page">Page {{ hit.pageIndex + 1 }}</span>
                <!-- A match has no snippet when the user may search but not copy text. -->
                @if (hit.snippet; as snippet) {
                  <span class="result-text">
                    …{{ snippet.before }}<mark>{{ snippet.match }}</mark
                    >{{ snippet.after }}…
                  </span>
                }
              </button>
            </li>
          }
        </ol>
      </div>
    </ng-container>

    <ng-template #loading><p class="loading">Loading…</p></ng-template>
  `,
})
export class App {
  protected readonly search = inject(EpdfSearch);
}
